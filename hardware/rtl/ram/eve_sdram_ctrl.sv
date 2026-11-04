// EVE IS42S16400J-6 SDRAM controller (single-beat vertical slice).
//
// One 16-bit word per request. Rows are kept open per bank; a request to a
// different row precharges the bank first. All -6 speed-grade cycle counts are
// parameters and are checked by tb_eve_sdram.sv against the behavioural model.
//
// This controller deliberately does not implement a burst/streaming path, bank
// interleaving for maximum bandwidth, or board-level calibration. It verifies
// command sequencing and timing only. Pinout, package and signal integrity are
// not qualified.
`timescale 1ns/1ps
`default_nettype none

module eve_sdram_ctrl #(
    parameter integer CL               = 3,
    parameter integer TRCD             = 3,
    parameter integer TRP              = 3,
    parameter integer TRAS             = 7,
    parameter integer TRC               = 10,
    parameter integer TWR               = 2,
    parameter integer TMRD              = 2,
    parameter integer TRFC              = 12,
    parameter integer REFRESH_INTERVAL = 2604,
    parameter integer INIT_WAIT        = 33200
) (
    input  wire        clk,
    input  wire        reset_n,

    // Single-beat user interface. Accepts one request at a time.
    input  wire        req_valid,
    output reg         req_ready,
    input  wire        req_we,
    input  wire [21:0] req_addr,      // [21:20] bank, [19:8] row, [7:0] column
    input  wire [15:0] req_wdata,
    output reg         req_done,
    output reg  [15:0] resp_rdata,
    output reg         resp_valid,

    // SDRAM command interface.
    output reg         cmd_valid,
    output reg  [2:0]  cmd,
    output reg  [1:0]  bank,
    output reg  [12:0] addr,
    output reg  [15:0] wdata,
    output reg         wdata_valid,

    input  wire [15:0] sdram_dq,
    input  wire        sdram_dq_valid,

    output reg         init_done,
    output reg         busy,
    output reg  [31:0] refresh_count
);

    localparam [2:0] CMD_NOP     = 3'd0;
    localparam [2:0] CMD_ACT     = 3'd1;
    localparam [2:0] CMD_READ    = 3'd2;
    localparam [2:0] CMD_WRITE   = 3'd3;
    localparam [2:0] CMD_PRE     = 3'd4;
    localparam [2:0] CMD_REF     = 3'd5;
    localparam [2:0] CMD_MRS     = 3'd6;
    localparam [2:0] CMD_PRE_ALL = 3'd7;

    localparam [12:0] MODE_REGISTER = 13'h0030; // sequential, burst 1, CL=3

    localparam integer S_INIT_WAIT     = 0;
    localparam integer S_INIT_PRE      = 1;
    localparam integer S_INIT_PRE_WAIT = 2;
    localparam integer S_INIT_REF1     = 3;
    localparam integer S_INIT_REF1_WAIT= 4;
    localparam integer S_INIT_REF2     = 5;
    localparam integer S_INIT_REF2_WAIT= 6;
    localparam integer S_INIT_MRS      = 7;
    localparam integer S_INIT_MRS_WAIT = 8;
    localparam integer S_READY         = 9;
    localparam integer S_WAIT_PRE      = 10;
    localparam integer S_PRECHARGE     = 11;
    localparam integer S_PRECHARGE_WAIT= 12;
    localparam integer S_WAIT_ACT      = 13;
    localparam integer S_ACTIVATE      = 14;
    localparam integer S_ACTIVATE_WAIT = 15;
    localparam integer S_CAS_READ      = 16;
    localparam integer S_READ_WAIT     = 17;
    localparam integer S_READ_DONE     = 18;
    localparam integer S_CAS_WRITE     = 19;
    localparam integer S_WRITE_WAIT    = 20;
    localparam integer S_REFRESH_WAIT  = 21;
    localparam integer S_REFRESH_PRE   = 22;
    localparam integer S_REFRESH_PRE_WAIT = 23;
    localparam integer S_REFRESH       = 24;
    localparam integer S_REFRESH_RECOVER = 25;

    integer state = S_INIT_WAIT;
    integer cycle = 0;
    integer ready_at = 0;
    integer refresh_timer = 0;
    reg     refresh_pending = 1'b0;

    reg [1:0]  active_bank = 2'd0;
    reg [11:0] active_row = 12'd0;
    reg [7:0]  active_col = 8'd0;
    reg        active_we = 1'b0;

    reg        bank_open [0:3];
    reg [11:0] bank_row  [0:3];
    integer    last_act  [0:3];
    integer    last_pre  [0:3];
    integer    last_write[0:3];
    integer    b;
    integer    earliest;

    function integer maxi(input integer a, input integer c);
        maxi = (a > c) ? a : c;
    endfunction

    task automatic command(input [2:0] code, input [1:0] bnk, input [12:0] a);
        begin
            cmd_valid <= 1'b1;
            cmd <= code;
            bank <= bnk;
            addr <= a;
        end
    endtask

    always @(posedge clk) begin
        if (!reset_n) begin
            state <= S_INIT_WAIT;
            cycle <= 0;
            ready_at <= INIT_WAIT;
            refresh_timer <= 0;
            refresh_pending <= 1'b0;
            init_done <= 1'b0;
            busy <= 1'b0;
            req_ready <= 1'b0;
            req_done <= 1'b0;
            resp_valid <= 1'b0;
            resp_rdata <= 16'd0;
            cmd_valid <= 1'b0;
            cmd <= CMD_NOP;
            bank <= 2'd0;
            addr <= 13'd0;
            wdata <= 16'd0;
            wdata_valid <= 1'b0;
            refresh_count <= 32'd0;
            for (b = 0; b < 4; b = b + 1) begin
                bank_open[b] <= 1'b0;
                bank_row[b] <= 12'd0;
                last_act[b] <= -1;
                last_pre[b] <= -1;
                last_write[b] <= -1;
            end
        end else begin
            cycle <= cycle + 1;
            cmd_valid <= 1'b0;
            wdata_valid <= 1'b0;
            req_done <= 1'b0;
            resp_valid <= 1'b0;

            if (init_done) begin
                if (!refresh_pending) begin
                    if (refresh_timer >= REFRESH_INTERVAL)
                        refresh_pending <= 1'b1;
                    else
                        refresh_timer <= refresh_timer + 1;
                end
            end

            case (state)
                S_INIT_WAIT: begin
                    req_ready <= 1'b0;
                    if (cycle >= ready_at) begin
                        command(CMD_PRE_ALL, 2'd0, 13'd0);
                        ready_at <= cycle + TRP;
                        state <= S_INIT_PRE_WAIT;
                    end
                end

                S_INIT_PRE_WAIT: begin
                    if (cycle >= ready_at) begin
                        command(CMD_REF, 2'd0, 13'd0);
                        ready_at <= cycle + TRFC;
                        state <= S_INIT_REF1_WAIT;
                        refresh_count <= refresh_count + 32'd1;
                    end
                end

                S_INIT_REF1_WAIT: begin
                    if (cycle >= ready_at) begin
                        command(CMD_REF, 2'd0, 13'd0);
                        ready_at <= cycle + TRFC;
                        state <= S_INIT_REF2_WAIT;
                        refresh_count <= refresh_count + 32'd1;
                    end
                end

                S_INIT_REF2_WAIT: begin
                    if (cycle >= ready_at) begin
                        command(CMD_MRS, 2'd0, MODE_REGISTER);
                        ready_at <= cycle + TMRD;
                        state <= S_INIT_MRS_WAIT;
                    end
                end

                S_INIT_MRS_WAIT: begin
                    if (cycle >= ready_at) begin
                        init_done <= 1'b1;
                        refresh_timer <= 0;
                        state <= S_READY;
                    end
                end

                S_READY: begin
                    req_ready <= 1'b1;
                    busy <= 1'b0;
                    if (refresh_pending) begin
                        req_ready <= 1'b0;
                        earliest = cycle;
                        for (b = 0; b < 4; b = b + 1) begin
                            if (last_act[b] >= 0) earliest = maxi(earliest, last_act[b] + TRAS);
                            if (last_write[b] >= 0) earliest = maxi(earliest, last_write[b] + TWR);
                        end
                        ready_at <= earliest;
                        state <= S_REFRESH_WAIT;
                    end else if (req_valid) begin
                        req_ready <= 1'b0;
                        busy <= 1'b1;
                        active_bank <= req_addr[21:20];
                        active_row <= req_addr[19:8];
                        active_col <= req_addr[7:0];
                        active_we <= req_we;
                        if (bank_open[req_addr[21:20]] &&
                            (bank_row[req_addr[21:20]] == req_addr[19:8])) begin
                            state <= req_we ? S_CAS_WRITE : S_CAS_READ;
                        end else if (bank_open[req_addr[21:20]]) begin
                            earliest = cycle;
                            if (last_act[req_addr[21:20]] >= 0)
                                earliest = maxi(earliest, last_act[req_addr[21:20]] + TRAS);
                            if (last_write[req_addr[21:20]] >= 0)
                                earliest = maxi(earliest, last_write[req_addr[21:20]] + TWR);
                            ready_at <= earliest;
                            state <= S_WAIT_PRE;
                        end else begin
                            earliest = cycle;
                            if (last_pre[req_addr[21:20]] >= 0)
                                earliest = maxi(earliest, last_pre[req_addr[21:20]] + TRP);
                            ready_at <= earliest;
                            state <= S_WAIT_ACT;
                        end
                    end
                end

                S_WAIT_PRE: begin
                    if (cycle >= ready_at) begin
                        command(CMD_PRE, active_bank, 13'd0);
                        last_pre[active_bank] <= cycle;
                        bank_open[active_bank] <= 1'b0;
                        ready_at <= cycle + TRP;
                        state <= S_WAIT_ACT;
                    end
                end

                S_WAIT_ACT: begin
                    if (cycle >= ready_at) begin
                        command(CMD_ACT, active_bank, {active_row, 1'b0});
                        last_act[active_bank] <= cycle;
                        bank_open[active_bank] <= 1'b1;
                        bank_row[active_bank] <= active_row;
                        ready_at <= cycle + TRCD;
                        state <= S_ACTIVATE_WAIT;
                    end
                end

                S_ACTIVATE_WAIT: begin
                    if (cycle >= ready_at)
                        state <= active_we ? S_CAS_WRITE : S_CAS_READ;
                end

                S_CAS_READ: begin
                    command(CMD_READ, active_bank, {4'd0, active_col});
                    state <= S_READ_WAIT;
                end

                S_READ_WAIT: begin
                    if (sdram_dq_valid) begin
                        resp_rdata <= sdram_dq;
                        resp_valid <= 1'b1;
                        state <= S_READ_DONE;
                    end
                end

                S_READ_DONE: begin
                    req_done <= 1'b1;
                    state <= S_READY;
                end

                S_CAS_WRITE: begin
                    command(CMD_WRITE, active_bank, {4'd0, active_col});
                    wdata <= req_wdata;
                    wdata_valid <= 1'b1;
                    last_write[active_bank] <= cycle;
                    ready_at <= cycle + TWR;
                    state <= S_WRITE_WAIT;
                end

                S_WRITE_WAIT: begin
                    if (cycle >= ready_at) begin
                        req_done <= 1'b1;
                        state <= S_READY;
                    end
                end

                S_REFRESH_WAIT: begin
                    if (cycle >= ready_at) begin
                        command(CMD_PRE_ALL, 2'd0, 13'd0);
                        for (b = 0; b < 4; b = b + 1) begin
                            bank_open[b] <= 1'b0;
                            last_pre[b] <= cycle;
                        end
                        ready_at <= cycle + TRP;
                        state <= S_REFRESH_PRE_WAIT;
                    end
                end

                S_REFRESH_PRE_WAIT: begin
                    if (cycle >= ready_at) begin
                        command(CMD_REF, 2'd0, 13'd0);
                        refresh_count <= refresh_count + 32'd1;
                        ready_at <= cycle + TRFC;
                        state <= S_REFRESH_RECOVER;
                    end
                end

                S_REFRESH_RECOVER: begin
                    if (cycle >= ready_at) begin
                        refresh_pending <= 1'b0;
                        refresh_timer <= 0;
                        state <= S_READY;
                    end
                end

                default: state <= S_READY;
            endcase
        end
    end

endmodule

`default_nettype wire
