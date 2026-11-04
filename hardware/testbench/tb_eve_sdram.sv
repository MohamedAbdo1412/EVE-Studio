// IS42S16400J-6 SDRAM controller verification.
//
// Verified here:
//   1. Power-up sequence waits INIT_WAIT cycles, precharges, issues two REFs
//      and programs the mode register before accepting traffic.
//   2. Single-beat writes and reads return the exact 16-bit data.
//   3. Row changes force precharge/activate; the model reports no timing
//      violations for tRCD, tRP, tRAS, tRC, tWR, tRFC or refresh spacing.
//   4. Read data appears CL cycles after READ.
//   5. Refresh runs during idle time and respects the 2604-cycle interval.
//
// Clock is an abstract 10 ns simulation clock. Cycle counts, not wall-clock
// nanoseconds, are what the -6 timing table requires.
`timescale 1ns/1ps
`default_nettype none

module tb_eve_sdram;

    localparam integer CL               = 3;
    localparam integer TRCD             = 3;
    localparam integer TRP              = 3;
    localparam integer TRAS             = 7;
    localparam integer TRC              = 10;
    localparam integer TWR              = 2;
    localparam integer TMRD             = 2;
    localparam integer TRFC             = 12;
    localparam integer REFRESH_INTERVAL = 2604;
    localparam integer REFRESH_MARGIN   = 64;
    localparam integer INIT_WAIT        = 33200;

    reg clk = 1'b0;
    reg reset_n = 1'b0;
    always #5 clk = ~clk;

    reg         req_valid = 1'b0;
    wire        req_ready;
    reg         req_we = 1'b0;
    reg  [21:0] req_addr = 22'd0;
    reg  [15:0] req_wdata = 16'd0;
    wire        req_done;
    wire [15:0] resp_rdata;
    wire        resp_valid;

    wire        cmd_valid;
    wire [2:0]  cmd;
    wire [1:0]  bank;
    wire [12:0] addr;
    wire [15:0] wdata;
    wire        wdata_valid;
    wire [15:0] dq;
    wire        dq_valid;

    wire        init_done;
    wire        busy;
    wire [31:0] refresh_count;

    wire [15:0] violation_count;
    wire [7:0]  last_violation;
    wire [15:0] last_read_latency;
    wire [31:0] act_count;
    wire [31:0] read_count;
    wire [31:0] write_count;
    wire [31:0] pre_count;
    wire [31:0] model_refresh_count;
    wire [31:0] max_refresh_gap;
    wire [31:0] first_cmd_cycle;

    eve_sdram_ctrl #(
        .CL(CL),
        .TRCD(TRCD),
        .TRP(TRP),
        .TRAS(TRAS),
        .TRC(TRC),
        .TWR(TWR),
        .TMRD(TMRD),
        .TRFC(TRFC),
        .REFRESH_INTERVAL(REFRESH_INTERVAL),
        .INIT_WAIT(INIT_WAIT)
    ) dut (
        .clk(clk),
        .reset_n(reset_n),
        .req_valid(req_valid),
        .req_ready(req_ready),
        .req_we(req_we),
        .req_addr(req_addr),
        .req_wdata(req_wdata),
        .req_done(req_done),
        .resp_rdata(resp_rdata),
        .resp_valid(resp_valid),
        .cmd_valid(cmd_valid),
        .cmd(cmd),
        .bank(bank),
        .addr(addr),
        .wdata(wdata),
        .wdata_valid(wdata_valid),
        .sdram_dq(dq),
        .sdram_dq_valid(dq_valid),
        .init_done(init_done),
        .busy(busy),
        .refresh_count(refresh_count)
    );

    is42s16400j_model #(
        .CL(CL),
        .TRCD(TRCD),
        .TRP(TRP),
        .TRAS(TRAS),
        .TRC(TRC),
        .TWR(TWR),
        .TMRD(TMRD),
        .TRFC(TRFC),
        .REFRESH_INTERVAL(REFRESH_INTERVAL),
        .REFRESH_MARGIN(REFRESH_MARGIN)
    ) model (
        .clk(clk),
        .reset_n(reset_n),
        .cmd_valid(cmd_valid),
        .cmd(cmd),
        .bank(bank),
        .addr(addr),
        .wdata(wdata),
        .wdata_valid(wdata_valid),
        .dq(dq),
        .dq_valid(dq_valid),
        .violation_count(violation_count),
        .last_violation(last_violation),
        .last_read_latency(last_read_latency),
        .act_count(act_count),
        .read_count(read_count),
        .write_count(write_count),
        .pre_count(pre_count),
        .refresh_count(model_refresh_count),
        .max_refresh_gap(max_refresh_gap),
        .first_cmd_cycle(first_cmd_cycle)
    );

    integer failures = 0;
    reg [15:0] rd_data = 16'd0;

    task automatic check(input condition, input [255:0] label);
        begin
            if (!condition) begin
                failures = failures + 1;
                $display("FAIL: %0s", label);
            end
        end
    endtask

    task automatic sdram_write(input [21:0] a, input [15:0] d);
        begin
            @(negedge clk);
            while (!req_ready) @(negedge clk);
            req_valid = 1'b1;
            req_we = 1'b1;
            req_addr = a;
            req_wdata = d;
            @(negedge clk);
            req_valid = 1'b0;
            req_we = 1'b0;
            while (!req_done) @(negedge clk);
        end
    endtask

    task automatic sdram_read(input [21:0] a);
        begin
            @(negedge clk);
            while (!req_ready) @(negedge clk);
            req_valid = 1'b1;
            req_we = 1'b0;
            req_addr = a;
            req_wdata = 16'd0;
            @(negedge clk);
            req_valid = 1'b0;
            while (!resp_valid) @(negedge clk);
            rd_data = resp_rdata;
            while (!req_done) @(negedge clk);
        end
    endtask

    // Address helpers: [21:20] bank, [19:8] row, [7:0] column.
    function [21:0] a22(input [1:0] bnk, input [11:0] row, input [7:0] col);
        a22 = {bnk, row, col};
    endfunction

    integer k;
    integer idle_cycles;
    integer refresh_before;
    integer act_before;

    initial begin
        reset_n = 1'b0;
        repeat (8) @(negedge clk);
        reset_n = 1'b1;
        repeat (2) @(negedge clk);

        check(init_done === 1'b0, "no traffic accepted during power-up");

        // Wait for initialization.
        k = 0;
        while (!init_done && k < INIT_WAIT + 200) begin
            @(negedge clk);
            k = k + 1;
        end
        check(init_done === 1'b1, "initialization completed");
        check(first_cmd_cycle >= INIT_WAIT, "first SDRAM command respected INIT_WAIT");
        check(model_refresh_count == 32'd2, "initialization issued two REF commands");
        check(violation_count == 16'd0, "initialization timing clean");

        // 1. Write several words, forcing row changes within bank 0.
        sdram_write(a22(2'd0, 12'h000, 8'h00), 16'hA55A);
        sdram_write(a22(2'd0, 12'h000, 8'h01), 16'h1234);
        sdram_write(a22(2'd0, 12'h001, 8'h05), 16'hBEEF);
        sdram_write(a22(2'd1, 12'h002, 8'h03), 16'hC0DE);
        sdram_write(a22(2'd3, 12'hFFF, 8'hFF), 16'h5AA5);
        sdram_write(a22(2'd0, 12'h000, 8'hFF), 16'h0F0F);

        check(violation_count == 16'd0, "row-change traffic respected all timing");

        // 2. Read every word back.
        sdram_read(a22(2'd0, 12'h000, 8'h00));
        check(rd_data == 16'hA55A, "read back bank0/row0/col0");
        check(last_read_latency == CL, "read data latency equals CL");

        sdram_read(a22(2'd0, 12'h000, 8'h01));
        check(rd_data == 16'h1234, "read back bank0/row0/col1");
        sdram_read(a22(2'd0, 12'h001, 8'h05));
        check(rd_data == 16'hBEEF, "read back bank0/row1/col5");
        sdram_read(a22(2'd1, 12'h002, 8'h03));
        check(rd_data == 16'hC0DE, "read back bank1/row2/col3");
        sdram_read(a22(2'd3, 12'hFFF, 8'hFF));
        check(rd_data == 16'h5AA5, "read back bank3/rowFFF/colFF");
        sdram_read(a22(2'd0, 12'h000, 8'hFF));
        check(rd_data == 16'h0F0F, "read back bank0/row0/colFF after row churn");

        check(act_count >= 32'd6, "controller activated rows as expected");
        check(read_count == 32'd6, "model observed six reads");
        check(write_count == 32'd6, "model observed six writes");
        check(pre_count >= 32'd3, "controller precharged before row changes");

        // 3. Idle long enough for several refresh cycles.
        refresh_before = model_refresh_count;
        idle_cycles = 4 * REFRESH_INTERVAL;
        repeat (idle_cycles) @(negedge clk);
        check((model_refresh_count - refresh_before) >= 3, "refreshes occurred while idle");
        check(max_refresh_gap <= (REFRESH_INTERVAL + REFRESH_MARGIN), "refresh spacing stayed within interval");
        check(violation_count == 16'd0, "refresh timing clean");

        // 4. Traffic still works after refresh.
        sdram_write(a22(2'd2, 12'h010, 8'h20), 16'hDEAD);
        sdram_read(a22(2'd2, 12'h010, 8'h20));
        check(rd_data == 16'hDEAD, "read back after refresh");
        sdram_read(a22(2'd0, 12'h000, 8'h00));
        check(rd_data == 16'hA55A, "earlier data survived refresh");

        check(violation_count == 16'd0, "no SDRAM timing violations");
        if (failures == 0) begin
            $display("PASS: IS42S16400J-6 timing verified (ACT %0d, READ %0d, WRITE %0d, PRE %0d, REF %0d, max refresh gap %0d cycles)",
                act_count, read_count, write_count, pre_count, model_refresh_count, max_refresh_gap);
        end else begin
            $display("FAIL: %0d SDRAM check(s) failed (last violation 0x%02h)", failures, last_violation);
        end
        $finish;
    end

    initial begin
        #20_000_000;
        $display("FAIL: SDRAM testbench timeout");
        $finish;
    end

endmodule

`default_nettype wire
