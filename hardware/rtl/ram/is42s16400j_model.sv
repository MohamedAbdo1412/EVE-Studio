// IS42S16400J-6 behavioural SDRAM model with cycle-level timing checks.
//
// The model implements the command truth table for a single 16-bit device:
// ACT, READ, WRITE, PRE, PRE ALL, REF and MRS. It checks the -6 speed-grade
// cycle counts used by eve_sdram_ctrl.sv and counts a violation whenever the
// controller breaks one. It is a functional/timing model, not a physical
// analogue model, and it does not claim SI, board or package qualification.
//
// 64 Mbit organisation: 4 banks x 4096 rows x 256 columns x 16 bits.
// Word address mapping used by the controller and this model:
//   [21:20] bank, [19:8] row, [7:0] column.
`timescale 1ns/1ps
`default_nettype none

module is42s16400j_model #(
    parameter integer CL                = 3,
    parameter integer TRCD              = 3,
    parameter integer TRP               = 3,
    parameter integer TRAS              = 7,
    parameter integer TRC               = 10,
    parameter integer TWR               = 2,
    parameter integer TMRD              = 2,
    parameter integer TRFC              = 12,
    parameter integer REFRESH_INTERVAL  = 2604,
    parameter integer REFRESH_MARGIN    = 64
) (
    input  wire        clk,
    input  wire        reset_n,

    // Command interface. Exactly one command cycle per asserted cmd_valid.
    input  wire        cmd_valid,
    input  wire [2:0]  cmd,
    input  wire [1:0]  bank,
    input  wire [12:0] addr,
    input  wire [15:0] wdata,
    input  wire        wdata_valid,

    // Read data.
    output reg  [15:0] dq,
    output reg         dq_valid,

    // Observations.
    output reg  [15:0] violation_count,
    output reg  [7:0]  last_violation,
    output reg  [15:0] last_read_latency,
    output reg  [31:0] act_count,
    output reg  [31:0] read_count,
    output reg  [31:0] write_count,
    output reg  [31:0] pre_count,
    output reg  [31:0] refresh_count,
    output reg  [31:0] max_refresh_gap,
    output reg  [31:0] first_cmd_cycle
);

    localparam [2:0] CMD_NOP     = 3'd0;
    localparam [2:0] CMD_ACT     = 3'd1;
    localparam [2:0] CMD_READ    = 3'd2;
    localparam [2:0] CMD_WRITE   = 3'd3;
    localparam [2:0] CMD_PRE     = 3'd4;
    localparam [2:0] CMD_REF     = 3'd5;
    localparam [2:0] CMD_MRS     = 3'd6;
    localparam [2:0] CMD_PRE_ALL = 3'd7;

    localparam [7:0] V_NONE             = 8'h00;
    localparam [7:0] V_ACT_WHILE_OPEN   = 8'h01;
    localparam [7:0] V_TRC              = 8'h02;
    localparam [7:0] V_TRP              = 8'h03;
    localparam [7:0] V_TRCD             = 8'h04;
    localparam [7:0] V_READ_NO_ROW      = 8'h05;
    localparam [7:0] V_READ_WRONG_ROW   = 8'h06;
    localparam [7:0] V_TRAS             = 8'h07;
    localparam [7:0] V_TWR              = 8'h08;
    localparam [7:0] V_REF_WHILE_OPEN   = 8'h09;
    localparam [7:0] V_TRFC             = 8'h0A;
    localparam [7:0] V_REFRESH_LATE     = 8'h0B;
    localparam [7:0] V_PRE_AFTER_REF    = 8'h0C;

    // 4 banks * 4096 rows * 256 columns words.
    reg [15:0] mem [0:4 * 4096 * 256 - 1];

    reg        open_valid [0:3];
    reg [11:0] open_row   [0:3];
    integer    last_act   [0:3];
    integer    last_pre   [0:3];
    integer    last_write [0:3];

    integer cycle = 0;
    integer last_refresh = -1;
    integer last_mrs = -1;
    integer pending_read_cycle = 0;
    integer dq_at = -1;
    reg [15:0] pending_data = 16'd0;
    integer b;

    wire [1:0]  act_bank = bank;
    wire [11:0] act_row  = addr[11:0];
    wire [7:0]  act_col  = addr[7:0];
    // READ/WRITE carry only the column; the row is implicit in the open row.
    wire [21:0] word_index = {act_bank, open_row[act_bank], act_col};

    task automatic violation(input [7:0] code);
        begin
            violation_count = violation_count + 16'd1;
            last_violation = code;
            $display("SDRAM MODEL VIOLATION 0x%02h at cycle %0d", code, cycle);
        end
    endtask

    task automatic do_precharge(input [1:0] target);
        begin
            if (open_valid[target]) begin
                if ((cycle - last_act[target]) < TRAS) violation(V_TRAS);
                if ((last_write[target] >= 0) && ((cycle - last_write[target]) < TWR)) violation(V_TWR);
                open_valid[target] = 1'b0;
            end
            last_pre[target] = cycle;
        end
    endtask

    initial begin
        violation_count = 16'd0;
        last_violation = V_NONE;
        last_read_latency = 16'd0;
        act_count = 32'd0;
        read_count = 32'd0;
        write_count = 32'd0;
        pre_count = 32'd0;
        refresh_count = 32'd0;
        max_refresh_gap = 32'd0;
        first_cmd_cycle = 32'hFFFFFFFF;
        for (b = 0; b < 4; b = b + 1) begin
            open_valid[b] = 1'b0;
            open_row[b] = 12'd0;
            last_act[b] = -1;
            last_pre[b] = -1;
            last_write[b] = -1;
        end
    end

    always @(posedge clk) begin
        if (!reset_n) begin
            cycle <= 0;
            dq <= 16'd0;
            dq_valid <= 1'b0;
            dq_at <= -1;
            last_refresh <= -1;
            last_mrs <= -1;
            violation_count <= 16'd0;
            last_violation <= V_NONE;
            act_count <= 32'd0;
            read_count <= 32'd0;
            write_count <= 32'd0;
            pre_count <= 32'd0;
            refresh_count <= 32'd0;
            max_refresh_gap <= 32'd0;
            first_cmd_cycle <= 32'hFFFFFFFF;
            for (b = 0; b < 4; b = b + 1) begin
                open_valid[b] <= 1'b0;
                last_act[b] <= -1;
                last_pre[b] <= -1;
                last_write[b] <= -1;
            end
        end else begin
            cycle <= cycle + 1;
            dq_valid <= 1'b0;

            // Read data appears CL cycles after the READ command.
            if (dq_at >= 0 && cycle == dq_at) begin
                dq <= pending_data;
                dq_valid <= 1'b1;
                last_read_latency <= cycle - pending_read_cycle;
                dq_at <= -1;
            end

            if (cmd_valid) begin
                if (first_cmd_cycle == 32'hFFFFFFFF) first_cmd_cycle <= cycle;

                // tRFC applies to every command after a REF.
                if ((last_refresh >= 0) && ((cycle - last_refresh) < TRFC))
                    violation(V_TRFC);

                case (cmd)
                    CMD_ACT: begin
                        if (open_valid[act_bank])
                            violation(V_ACT_WHILE_OPEN);
                        if ((last_act[act_bank] >= 0) && ((cycle - last_act[act_bank]) < TRC))
                            violation(V_TRC);
                        if ((last_pre[act_bank] >= 0) && ((cycle - last_pre[act_bank]) < TRP))
                            violation(V_TRP);
                        open_valid[act_bank] <= 1'b1;
                        open_row[act_bank] <= act_row;
                        last_act[act_bank] <= cycle;
                        act_count <= act_count + 32'd1;
                    end

                    CMD_READ, CMD_WRITE: begin
                        if (!open_valid[act_bank])
                            violation(V_READ_NO_ROW);
                        if ((last_act[act_bank] < 0) || ((cycle - last_act[act_bank]) < TRCD))
                            violation(V_TRCD);
                        if (cmd == CMD_READ) begin
                            pending_data <= mem[word_index];
                            pending_read_cycle <= cycle;
                            dq_at <= cycle + CL;
                            read_count <= read_count + 32'd1;
                        end else begin
                            if (wdata_valid) mem[word_index] <= wdata;
                            last_write[act_bank] <= cycle;
                            write_count <= write_count + 32'd1;
                        end
                    end

                    CMD_PRE: begin
                        do_precharge(act_bank);
                        pre_count <= pre_count + 32'd1;
                    end

                    CMD_PRE_ALL: begin
                        for (b = 0; b < 4; b = b + 1) do_precharge(b[1:0]);
                        pre_count <= pre_count + 32'd1;
                    end

                    CMD_REF: begin
                        for (b = 0; b < 4; b = b + 1) begin
                            if (open_valid[b]) violation(V_REF_WHILE_OPEN);
                            else if ((last_pre[b] >= 0) && ((cycle - last_pre[b]) < TRP))
                                violation(V_TRP);
                        end
                        if (last_refresh >= 0) begin
                            if ((cycle - last_refresh) > (REFRESH_INTERVAL + REFRESH_MARGIN))
                                violation(V_REFRESH_LATE);
                            if ((cycle - last_refresh) > max_refresh_gap)
                                max_refresh_gap <= cycle - last_refresh;
                        end
                        last_refresh <= cycle;
                        refresh_count <= refresh_count + 32'd1;
                    end

                    CMD_MRS: begin
                        if ((last_mrs >= 0) && ((cycle - last_mrs) < TMRD))
                            violation(V_TRFC);
                        last_mrs <= cycle;
                    end

                    CMD_NOP: begin
                        // No effect.
                    end

                    default: begin
                        // Unknown command is ignored.
                    end
                endcase
            end
        end
    end

endmodule

`default_nettype wire
