// W25Q128JV behavioural command-layer model.
//
// This model represents the SPI NOR command layer (WREN, PAGE PROGRAM, SECTOR
// ERASE, READ) rather than the physical SCK/MOSI/MISO pins. It exists so a
// controller can be verified against the real device's page and sector rules.
//
// W25Q128JV constraints modelled:
//   - 16 MiB capacity (16,777,216 bytes).
//   - 256-byte program pages. A PAGE PROGRAM that crosses a page boundary
//     wraps inside that page on the real device; this model reports the event
//     through page_cross_error and applies the same wrap so a controller bug
//     cannot hide behind a convenient error.
//   - 4 KiB erase sectors.
//
// Timing counters are shortened simulation delays. This model does not claim
// the W25Q128JV's physical tPP/tSE/tRES1 timings.
`timescale 1ns/1ps
`default_nettype none

module w25q128jv_model #(
    parameter integer MEM_BYTES    = 16 * 1024 * 1024,
    parameter integer PAGE_BYTES   = 256,
    parameter integer SECTOR_BYTES = 4096,
    parameter integer ERASE_CYCLES = 64,
    parameter integer PROGRAM_CYCLES = 8
) (
    input  wire        clk,
    input  wire        reset_n,

    // Command interface (replaces the serial pin sequence).
    input  wire        cmd_valid,
    output reg         cmd_ready,
    input  wire [7:0]  cmd,
    input  wire [23:0] addr,
    input  wire [15:0] len,
    input  wire [7:0]  wdata,
    input  wire        wvalid,
    output reg  [7:0]  rdata,
    output reg         rvalid,

    // Device status.
    output reg         ready,
    output reg         busy,
    output reg         write_enable_latch,
    output reg         page_cross_error,
    output reg         range_error,
    output reg  [31:0] page_program_count,
    output reg  [31:0] sector_erase_count,
    output reg  [31:0] read_count
);

    localparam [7:0] CMD_WREN = 8'h06;
    localparam [7:0] CMD_PP   = 8'h02;
    localparam [7:0] CMD_SE   = 8'h20;
    localparam [7:0] CMD_READ = 8'h03;
    localparam [7:0] CMD_RDSR = 8'h05;

    localparam integer S_IDLE      = 0;
    localparam integer S_ERASE     = 1;
    localparam integer S_ERASE_WAIT = 2;
    localparam integer S_PROGRAM   = 3;
    localparam integer S_PROGRAM_WAIT = 4;
    localparam integer S_READ      = 5;
    localparam integer S_STATUS    = 6;

    // 16 MiB of byte-wide storage. This is a simulation model, not a
    // synthesizable memory macro.
    reg [7:0] mem [0:MEM_BYTES - 1];

    integer state = S_IDLE;
    integer index = 0;
    integer wait_count = 0;
    reg [23:0] sector_base = 24'd0;
    reg [15:0] transfer_length = 16'd0;
    reg [23:0] transfer_addr = 24'd0;

    wire [23:0] page_base = {transfer_addr[23:8], 8'h00};
    wire [23:0] wrapped_addr = page_base | {16'd0, transfer_addr[7:0] + index[7:0]};

    integer init_index;
    reg page_cross_reported = 1'b0;
    initial begin
        for (init_index = 0; init_index < MEM_BYTES; init_index = init_index + 1)
            mem[init_index] = 8'hFF;
        page_cross_error = 1'b0;
        range_error = 1'b0;
        page_program_count = 32'd0;
        sector_erase_count = 32'd0;
        read_count = 32'd0;
    end

    always @(posedge clk) begin
        if (!reset_n) begin
            state <= S_IDLE;
            cmd_ready <= 1'b1;
            ready <= 1'b1;
            busy <= 1'b0;
            write_enable_latch <= 1'b0;
            rvalid <= 1'b0;
            rdata <= 8'h00;
            index <= 0;
            wait_count <= 0;
            page_cross_error <= 1'b0;
            range_error <= 1'b0;
            page_program_count <= 32'd0;
            sector_erase_count <= 32'd0;
            read_count <= 32'd0;
        end else begin
            rvalid <= 1'b0;

            case (state)
                S_IDLE: begin
                    cmd_ready <= 1'b1;
                    ready <= 1'b1;
                    busy <= 1'b0;
                    if (cmd_valid) begin
                        cmd_ready <= 1'b0;
                        ready <= 1'b0;
                        busy <= 1'b1;
                        case (cmd)
                            CMD_WREN: begin
                                write_enable_latch <= 1'b1;
                                state <= S_STATUS;
                                wait_count <= 1;
                            end
                            CMD_SE: begin
                                if (addr >= MEM_BYTES) begin
                                    range_error <= 1'b1;
                                    state <= S_STATUS;
                                end else begin
                                    sector_base <= {addr[23:12], 12'h000};
                                    index <= 0;
                                    wait_count <= ERASE_CYCLES;
                                    state <= S_ERASE;
                                    sector_erase_count <= sector_erase_count + 32'd1;
                                end
                            end
                            CMD_PP: begin
                                if (addr >= MEM_BYTES || len == 0 || len > PAGE_BYTES) begin
                                    range_error <= 1'b1;
                                    state <= S_STATUS;
                                end else begin
                                    if ((addr[7:0] + len) > PAGE_BYTES)
                                        page_cross_error <= 1'b1;
                                    transfer_addr <= addr;
                                    transfer_length <= len;
                                    index <= 0;
                                    page_program_count <= page_program_count + 32'd1;
                                    state <= S_PROGRAM;
                                end
                            end
                            CMD_READ: begin
                                if (addr >= MEM_BYTES || len == 0 || (addr + len) > MEM_BYTES) begin
                                    range_error <= 1'b1;
                                    state <= S_STATUS;
                                end else begin
                                    transfer_addr <= addr;
                                    transfer_length <= len;
                                    index <= 0;
                                    read_count <= read_count + 32'd1;
                                    state <= S_READ;
                                end
                            end
                            CMD_RDSR: begin
                                rdata <= {6'b000000, write_enable_latch, busy};
                                rvalid <= 1'b1;
                                state <= S_STATUS;
                                wait_count <= 1;
                            end
                            default: begin
                                // Unknown command is ignored, mirroring the device.
                                state <= S_STATUS;
                                wait_count <= 1;
                            end
                        endcase
                    end
                end

                S_ERASE: begin
                    // One byte per cycle is enough for a functional model.
                    if (index < SECTOR_BYTES) begin
                        mem[sector_base + index[11:0]] <= 8'hFF;
                        index <= index + 1;
                    end else if (wait_count > 0) begin
                        wait_count <= wait_count - 1;
                    end else begin
                        write_enable_latch <= 1'b0;
                        state <= S_STATUS;
                        wait_count <= 1;
                    end
                end

                S_PROGRAM: begin
                    if (wvalid) begin
                        mem[wrapped_addr] <= wdata;
                        index <= index + 1;
                        if (index + 1 >= transfer_length) begin
                            wait_count <= PROGRAM_CYCLES;
                            state <= S_PROGRAM_WAIT;
                        end
                    end
                end

                S_PROGRAM_WAIT: begin
                    if (wait_count > 0) wait_count <= wait_count - 1;
                    else begin
                        write_enable_latch <= 1'b0;
                        state <= S_STATUS;
                        wait_count <= 1;
                    end
                end

                S_READ: begin
                    if (index < transfer_length) begin
                        rdata <= mem[transfer_addr + index];
                        rvalid <= 1'b1;
                        index <= index + 1;
                    end else begin
                        state <= S_STATUS;
                        wait_count <= 1;
                    end
                end

                S_STATUS: begin
                    // One idle cycle between commands.
                    if (wait_count > 0) wait_count <= wait_count - 1;
                    else begin
                        state <= S_IDLE;
                        cmd_ready <= 1'b1;
                        ready <= 1'b1;
                        busy <= 1'b0;
                    end
                end

                default: state <= S_IDLE;
            endcase
        end
    end

    // Reaching here without a page error is the controller's responsibility.
    // The wrap itself is implemented above so a crossing program cannot quietly
    // become a different byte range.
    // synthesis translate_off
    always @(posedge clk) begin
        if (!reset_n) begin
            page_cross_reported <= 1'b0;
        end else if (page_cross_error && state == S_PROGRAM && !page_cross_reported) begin
            page_cross_reported <= 1'b1;
            $display("W25Q128JV MODEL NOTE: page-crossing PAGE PROGRAM flagged at 0x%06h len %0d (data wrapped inside the page, as on the device)", transfer_addr, transfer_length);
        end
    end
    // synthesis translate_on

endmodule

`default_nettype wire
