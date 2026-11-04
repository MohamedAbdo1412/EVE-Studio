// Flash writer verification against the W25Q128JV page/sector model.
//
// Checks:
//   1. A 300-byte write starting at 0x00F0 is split into three PAGE PROGRAM
//      operations and reads back byte-for-byte.
//   2. A write crossing a 4 KiB sector boundary erases both sectors and reads
//      back exactly.
//   3. An oversized request is refused before any flash command is issued.
//   4. The model itself flags a page-crossing PAGE PROGRAM.
//
// This is a command-layer simulation. Physical tPP/tSE timing is not claimed.
`timescale 1ns/1ps
`default_nettype none

module tb_eve_flash_writer;

    localparam integer MEM_BYTES = 16 * 1024 * 1024;
    localparam integer MAX_TRANSFER = 512;

    localparam [7:0] CMD_WREN = 8'h06;
    localparam [7:0] CMD_PP   = 8'h02;
    localparam [7:0] CMD_SE   = 8'h20;
    localparam [7:0] CMD_READ = 8'h03;
    localparam [7:0] CMD_RDSR = 8'h05;

    reg clk = 1'b0;
    reg reset_n = 1'b0;
    always #5 clk = ~clk;

    reg start = 1'b0;
    reg [23:0] start_addr = 24'd0;
    reg [15:0] length = 16'd0;
    wire wready;
    wire busy;
    wire done;
    wire error;
    wire [7:0] error_code;

    wire wr_cmd_valid;
    wire [7:0] wr_cmd;
    wire [23:0] wr_addr;
    wire [15:0] wr_len;
    wire [7:0] wr_fdata;
    wire wr_fvalid;

    reg tb_cmd_valid = 1'b0;
    reg [7:0] tb_cmd = 8'h00;
    reg [23:0] tb_addr = 24'd0;
    reg [15:0] tb_len = 16'd0;

    wire bus_cmd_valid = tb_cmd_valid | wr_cmd_valid;
    wire [7:0] bus_cmd = tb_cmd_valid ? tb_cmd : wr_cmd;
    wire [23:0] bus_addr = tb_cmd_valid ? tb_addr : wr_addr;
    wire [15:0] bus_len = tb_cmd_valid ? tb_len : wr_len;
    wire [7:0] bus_wdata = tb_cmd_valid ? 8'h00 : wr_fdata;
    wire bus_wvalid = tb_cmd_valid ? 1'b0 : wr_fvalid;

    reg [7:0] src_byte = 8'h00;
    reg src_valid = 1'b0;

    wire f_cmd_ready;
    wire f_ready;
    wire f_busy;
    wire [7:0] f_rdata;
    wire f_rvalid;
    wire page_cross_error;
    wire range_error;
    wire [31:0] page_program_count;
    wire [31:0] sector_erase_count;
    wire [31:0] read_count;

    eve_flash_writer #(
        .CAPACITY_BYTES(MEM_BYTES)
    ) writer (
        .clk(clk),
        .reset_n(reset_n),
        .start(start),
        .start_addr(start_addr),
        .length(length),
        .wdata(src_byte),
        .wvalid(src_valid),
        .wready(wready),
        .busy(busy),
        .done(done),
        .error(error),
        .error_code(error_code),
        .cmd_valid(wr_cmd_valid),
        .cmd_ready(f_cmd_ready),
        .cmd(wr_cmd),
        .faddr(wr_addr),
        .flen(wr_len),
        .fdata(wr_fdata),
        .fvalid(wr_fvalid),
        .flash_ready(f_ready)
    );

    w25q128jv_model #(
        .MEM_BYTES(MEM_BYTES)
    ) flash (
        .clk(clk),
        .reset_n(reset_n),
        .cmd_valid(bus_cmd_valid),
        .cmd_ready(f_cmd_ready),
        .cmd(bus_cmd),
        .addr(bus_addr),
        .len(bus_len),
        .wdata(bus_wdata),
        .wvalid(bus_wvalid),
        .rdata(f_rdata),
        .rvalid(f_rvalid),
        .ready(f_ready),
        .busy(f_busy),
        .write_enable_latch(),
        .page_cross_error(page_cross_error),
        .range_error(range_error),
        .page_program_count(page_program_count),
        .sector_erase_count(sector_erase_count),
        .read_count(read_count)
    );

    // ---------------------------------------------------------------------
    // Source byte stream.
    // ---------------------------------------------------------------------
    reg [7:0] source [0:MAX_TRANSFER - 1];
    reg [7:0] readback [0:MAX_TRANSFER - 1];
    integer src_index = 0;
    integer src_length = 0;

    always @* begin
        src_byte = source[src_index];
        src_valid = (src_index < src_length);
    end

    always @(posedge clk) begin
        if (reset_n && wready && src_valid) begin
            src_index <= src_index + 1;
        end
    end

    integer failures = 0;
    integer i;

    task automatic check(input condition, input [255:0] label);
        begin
            if (!condition) begin
                failures = failures + 1;
                $display("FAIL: %0s", label);
            end
        end
    endtask

    task automatic load_pattern(input integer n, input integer seed);
        integer k;
        begin
            for (k = 0; k < n; k = k + 1) source[k] = (k * 37 + seed) & 8'hFF;
            src_index = 0;
            src_length = n;
        end
    endtask

    task automatic flash_read(input [23:0] a, input integer n);
        integer k;
        begin
            @(negedge clk);
            tb_cmd_valid = 1'b1;
            tb_cmd = CMD_READ;
            tb_addr = a;
            tb_len = n[15:0];
            @(posedge clk);
            while (!f_cmd_ready) @(posedge clk);
            @(negedge clk);
            tb_cmd_valid = 1'b0;
            k = 0;
            while (k < n) begin
                @(posedge clk);
                if (f_rvalid) begin
                    readback[k] = f_rdata;
                    k = k + 1;
                end
            end
            while (!f_ready) @(posedge clk);
            @(negedge clk);
        end
    endtask

    task automatic run_write(input [23:0] a, input integer n, input integer seed);
        begin
            load_pattern(n, seed);
            @(negedge clk);
            start_addr = a;
            length = n[15:0];
            start = 1'b1;
            // start is level-sensitive: hold it until the sequencer reports
            // done so the result is observable without a race.
            while (!done) @(posedge clk);
            @(negedge clk);
            start = 1'b0;
            src_length = 0;
            src_index = 0;
        end
    endtask

    task automatic verify_bytes(input integer n, input [255:0] label);
        integer k;
        begin
            for (k = 0; k < n; k = k + 1) begin
                if (readback[k] !== source[k]) begin
                    failures = failures + 1;
                    $display("FAIL: %0s byte %0d expected %02h got %02h", label, k, source[k], readback[k]);
                    k = n;
                end
            end
        end
    endtask

    task automatic verify_all_ff(input [23:0] a, input integer n, input [255:0] label);
        integer k;
        begin
            flash_read(a, n);
            for (k = 0; k < n; k = k + 1) begin
                if (readback[k] !== 8'hFF) begin
                    failures = failures + 1;
                    $display("FAIL: %0s byte %0d expected FF got %02h", label, k, readback[k]);
                    k = n;
                end
            end
        end
    endtask

    integer baseline_pp;
    integer baseline_erase;

    initial begin
        for (i = 0; i < MAX_TRANSFER; i = i + 1) begin
            source[i] = 8'h00;
            readback[i] = 8'h00;
        end
        reset_n = 1'b0;
        repeat (4) @(negedge clk);
        reset_n = 1'b1;
        repeat (2) @(negedge clk);

        // 1. Page-splitting write: 0x00F0 + 300 crosses pages 0x0000, 0x0100,
        //    0x0200 and must produce exactly three program operations.
        baseline_pp = page_program_count;
        baseline_erase = sector_erase_count;
        run_write(24'h0000F0, 300, 7);
        check(error === 1'b0, "page-split write reported no error");
        check(done === 1'b1, "page-split write completed");
        check((page_program_count - baseline_pp) == 3, "300-byte write used 3 page programs");
        check((sector_erase_count - baseline_erase) == 1, "first sector erased once");
        check(page_cross_error === 1'b0, "writer never crossed a page boundary");
        check(range_error === 1'b0, "writer addresses stayed in range");
        flash_read(24'h0000F0, 300);
        verify_bytes(300, "page-split");
        verify_all_ff(24'h000000, 32'h20, "pre-write sector bytes remain erased");
        verify_all_ff(24'h00021C, 32'h20, "post-write sector bytes remain erased");

        // 2. Sector-crossing write: 0x0FF0 + 64 needs sectors 0 and 1 erased.
        baseline_pp = page_program_count;
        baseline_erase = sector_erase_count;
        run_write(24'h000FF0, 64, 173);
        check(error === 1'b0, "sector-crossing write reported no error");
        check((sector_erase_count - baseline_erase) == 2, "both touched sectors erased");
        check((page_program_count - baseline_pp) == 2, "sector-crossing write used 2 page programs");
        check(page_cross_error === 1'b0, "sector-crossing write stayed inside pages");
        flash_read(24'h000FF0, 64);
        verify_bytes(64, "sector-crossing");
        verify_all_ff(24'h001040, 32'h20, "bytes after sector-crossing write stay erased");

        // 3. Oversized request is refused before any flash command.
        baseline_pp = page_program_count;
        run_write(24'hFFFFF0, 32, 91);
        check(error === 1'b1, "oversized write rejected");
        check(error_code == 8'h01, "oversized write reports range error code");
        check(page_program_count == baseline_pp, "oversized write issued no page program");
        check(range_error === 1'b0, "flash itself never saw an out-of-range command");

        // 4. The model flags a page-crossing PAGE PROGRAM.
        @(negedge clk);
        tb_cmd_valid = 1'b1;
        tb_cmd = CMD_PP;
        tb_addr = 24'h000010;
        tb_len = 16'd256;
        @(posedge clk);
        while (!f_cmd_ready) @(posedge clk);
        @(negedge clk);
        tb_cmd_valid = 1'b0;
        repeat (2) @(posedge clk);
        check(page_cross_error === 1'b1, "model flags a page-crossing PAGE PROGRAM");

        if (failures == 0) begin
            $display("PASS: W25Q128JV page/sector model verified (3 page programs, 2 sector erases, range guard, page-cross detection)");
        end else begin
            $display("FAIL: %0d flash writer check(s) failed", failures);
        end
        $finish;
    end

    initial begin
        #20_000_000;
        $display("FAIL: flash testbench timeout");
        $finish;
    end

endmodule

`default_nettype wire
