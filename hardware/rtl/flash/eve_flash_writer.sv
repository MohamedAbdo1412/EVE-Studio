// EVE W25Q128JV write sequencer.
//
// Splits an arbitrary write into page-aligned PAGE PROGRAM operations, erases a
// 4 KiB sector before its first page is programmed, and refuses writes that do
// not fit the device. It never truncates a request and never asks the flash to
// cross a 256-byte page boundary.
//
// Address and length are accepted once per `start`. The source byte stream is
// consumed through wvalid/wready; the caller must supply exactly `length` bytes.
`timescale 1ns/1ps
`default_nettype none

module eve_flash_writer #(
    parameter integer CAPACITY_BYTES = 16 * 1024 * 1024,
    parameter integer PAGE_BYTES     = 256,
    parameter integer SECTOR_BYTES   = 4096
) (
    input  wire        clk,
    input  wire        reset_n,

    input  wire        start,
    input  wire [23:0] start_addr,
    input  wire [15:0] length,
    input  wire [7:0]  wdata,
    input  wire        wvalid,
    output reg         wready,

    output reg         busy,
    output reg         done,
    output reg         error,
    output reg  [7:0]  error_code,

    // W25Q128JV command interface.
    output reg         cmd_valid,
    input  wire        cmd_ready,
    output reg  [7:0]  cmd,
    output reg  [23:0] faddr,
    output reg  [15:0] flen,
    output reg  [7:0]  fdata,
    output reg         fvalid,
    input  wire        flash_ready
);

    localparam [7:0] CMD_WREN = 8'h06;
    localparam [7:0] CMD_PP   = 8'h02;
    localparam [7:0] CMD_SE   = 8'h20;

    localparam [7:0] ERR_NONE        = 8'h00;
    localparam [7:0] ERR_RANGE       = 8'h01;
    localparam [7:0] ERR_ZERO_LENGTH = 8'h02;

    localparam integer S_IDLE       = 0;
    localparam integer S_NEXT_PAGE  = 1;
    localparam integer S_ERASE_SETUP = 2;
    localparam integer S_ERASE_CMD  = 3;
    localparam integer S_ERASE_WAIT = 4;
    localparam integer S_FILL       = 5;
    localparam integer S_WREN_SETUP = 6;
    localparam integer S_WREN_CMD   = 7;
    localparam integer S_WREN_WAIT  = 8;
    localparam integer S_PP_SETUP   = 9;
    localparam integer S_PP_CMD     = 10;
    localparam integer S_PP_WAIT    = 11;
    localparam integer S_STREAM     = 12;
    localparam integer S_PROG_WAIT  = 13;
    localparam integer S_DONE       = 14;
    localparam integer S_ERROR      = 15;

    reg [7:0]  buffer [0:PAGE_BYTES - 1];
    integer    state = S_IDLE;
    integer    fill_count = 0;
    integer    stream_index = 0;
    integer    chunk = 0;
    integer    remaining = 0;
    reg [23:0] next_addr = 24'd0;
    reg [23:0] page_base = 24'd0;
    reg [31:0] erased_sector = 32'hFFFFFFFF;
    reg [31:0] sector_index = 32'd0;
    reg [23:0] sector_base = 24'd0;
    integer    guard;

    wire [31:0] capacity = CAPACITY_BYTES;
    wire [31:0] request_end = {8'd0, start_addr} + {16'd0, length};

    always @(posedge clk) begin
        if (!reset_n) begin
            state <= S_IDLE;
            busy <= 1'b0;
            done <= 1'b0;
            error <= 1'b0;
            error_code <= ERR_NONE;
            wready <= 1'b0;
            cmd_valid <= 1'b0;
            fvalid <= 1'b0;
            fill_count <= 0;
            stream_index <= 0;
            remaining <= 0;
            next_addr <= 24'd0;
            erased_sector <= 32'hFFFFFFFF;
        end else begin
            case (state)
                S_IDLE: begin
                    done <= 1'b0;
                    error <= 1'b0;
                    error_code <= ERR_NONE;
                    wready <= 1'b0;
                    cmd_valid <= 1'b0;
                    fvalid <= 1'b0;
                    if (start) begin
                        if (length == 0) begin
                            error <= 1'b1;
                            error_code <= ERR_ZERO_LENGTH;
                            done <= 1'b1;
                            state <= S_ERROR;
                        end else if (request_end > capacity) begin
                            // Refuse the whole request. No bytes are written, so
                            // nothing can be silently truncated.
                            error <= 1'b1;
                            error_code <= ERR_RANGE;
                            done <= 1'b1;
                            state <= S_ERROR;
                        end else begin
                            next_addr <= start_addr;
                            remaining <= length;
                            erased_sector <= 32'hFFFFFFFF;
                            busy <= 1'b1;
                            state <= S_NEXT_PAGE;
                        end
                    end
                end

                S_NEXT_PAGE: begin
                    if (remaining == 0) begin
                        busy <= 1'b0;
                        done <= 1'b1;
                        state <= S_DONE;
                    end else begin
                        page_base <= {next_addr[23:8], 8'h00};
                        chunk <= (PAGE_BYTES - next_addr[7:0]) < remaining
                            ? (PAGE_BYTES - next_addr[7:0])
                            : remaining;
                        sector_index <= next_addr / SECTOR_BYTES;
                        sector_base <= (next_addr / SECTOR_BYTES) * SECTOR_BYTES;
                        fill_count <= 0;
                        stream_index <= 0;
                        if ((next_addr / SECTOR_BYTES) != erased_sector) state <= S_ERASE_SETUP;
                        else begin
                            wready <= 1'b1;
                            state <= S_FILL;
                        end
                    end
                end

                S_ERASE_SETUP: begin
                    cmd <= CMD_SE;
                    faddr <= sector_base;
                    flen <= 16'd0;
                    cmd_valid <= 1'b1;
                    state <= S_ERASE_CMD;
                end

                S_ERASE_CMD: begin
                    cmd_valid <= 1'b1;
                    if (cmd_ready) begin
                        cmd_valid <= 1'b0;
                        state <= S_ERASE_WAIT;
                    end
                end

                S_ERASE_WAIT: begin
                    cmd_valid <= 1'b0;
                    if (flash_ready) begin
                        erased_sector <= sector_index;
                        wready <= 1'b1;
                        state <= S_FILL;
                    end
                end

                S_FILL: begin
                    if (wvalid && wready) begin
                        buffer[fill_count] <= wdata;
                        if (fill_count + 1 == chunk) begin
                            wready <= 1'b0;
                            stream_index <= 0;
                            state <= S_WREN_SETUP;
                        end else begin
                            fill_count <= fill_count + 1;
                        end
                    end
                end

                S_WREN_SETUP: begin
                    cmd <= CMD_WREN;
                    faddr <= 24'd0;
                    flen <= 16'd0;
                    cmd_valid <= 1'b1;
                    state <= S_WREN_CMD;
                end

                S_WREN_CMD: begin
                    cmd_valid <= 1'b1;
                    if (cmd_ready) begin
                        cmd_valid <= 1'b0;
                        state <= S_WREN_WAIT;
                    end
                end

                S_WREN_WAIT: begin
                    cmd_valid <= 1'b0;
                    if (flash_ready) state <= S_PP_SETUP;
                end

                S_PP_SETUP: begin
                    cmd <= CMD_PP;
                    // Program from the current address, not the page base: the
                    // device uses the low address bits as the in-page offset.
                    faddr <= next_addr;
                    flen <= chunk[15:0];
                    cmd_valid <= 1'b1;
                    state <= S_PP_CMD;
                end

                S_PP_CMD: begin
                    cmd_valid <= 1'b1;
                    if (cmd_ready) begin
                        cmd_valid <= 1'b0;
                        state <= S_PP_WAIT;
                    end
                end

                S_PP_WAIT: begin
                    // The flash is now busy with the program command. One cycle
                    // of separation lets the command transfer complete before
                    // the first data byte is presented.
                    cmd_valid <= 1'b0;
                    stream_index <= 0;
                    fvalid <= 1'b1;
                    fdata <= buffer[0];
                    state <= S_STREAM;
                end

                S_STREAM: begin
                    if (stream_index + 1 == chunk) begin
                        fvalid <= 1'b0;
                        state <= S_PROG_WAIT;
                    end else begin
                        stream_index <= stream_index + 1;
                        fdata <= buffer[stream_index + 1];
                        fvalid <= 1'b1;
                    end
                end

                S_PROG_WAIT: begin
                    fvalid <= 1'b0;
                    if (flash_ready) begin
                        next_addr <= next_addr + chunk[23:0];
                        remaining <= remaining - chunk;
                        state <= S_NEXT_PAGE;
                    end
                end

                S_DONE, S_ERROR: begin
                    wready <= 1'b0;
                    cmd_valid <= 1'b0;
                    fvalid <= 1'b0;
                    if (!start) begin
                        done <= 1'b0;
                        error <= 1'b0;
                        error_code <= ERR_NONE;
                        state <= S_IDLE;
                    end
                end

                default: state <= S_IDLE;
            endcase
        end
    end

    // Simulation-only guard: a correct sequencer never lets these happen.
    // synthesis translate_off
    always @(posedge clk) begin
        if (reset_n && state == S_STREAM && stream_index >= PAGE_BYTES)
            $display("EVE FLASH WRITER: stream index exceeded page size");
    end
    // synthesis translate_on

endmodule

`default_nettype wire
