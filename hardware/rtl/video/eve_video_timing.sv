// EVE video timing generator.
//
// Produces the parallel RGB timing for the ADV7513 reference bridge. All
// blanking values are parameters; the 1080p30 defaults are the reference
// profile and are verified by tb_eve_video_timing.sv.
//
// Coordinate convention: y = 0 is the first active line. Front porch, sync and
// back porch follow the active region. x = 0 is the first active pixel.
`timescale 1ns/1ps
`default_nettype none

module eve_video_timing #(
    parameter integer H_ACTIVE       = 1920,
    parameter integer H_FRONT_PORCH  = 88,
    parameter integer H_SYNC         = 44,
    parameter integer H_BACK_PORCH   = 148,
    parameter integer V_ACTIVE       = 1080,
    parameter integer V_FRONT_PORCH  = 4,
    parameter integer V_SYNC         = 5,
    parameter integer V_BACK_PORCH   = 36,
    parameter integer H_SYNC_POLARITY = 1,
    parameter integer V_SYNC_POLARITY = 1
) (
    input  wire        clk,
    input  wire        reset_n,
    output reg  [15:0] x,
    output reg  [15:0] y,
    output wire        hsync,
    output wire        vsync,
    output wire        de,
    output wire        frame_start,
    output wire        line_start,
    output wire        active_line_start
);

    localparam integer H_TOTAL = H_ACTIVE + H_FRONT_PORCH + H_SYNC + H_BACK_PORCH;
    localparam integer V_TOTAL = V_ACTIVE + V_FRONT_PORCH + V_SYNC + V_BACK_PORCH;

    wire h_sync_window = (x >= H_ACTIVE + H_FRONT_PORCH) && (x < H_ACTIVE + H_FRONT_PORCH + H_SYNC);
    wire v_sync_window = (y >= V_ACTIVE + V_FRONT_PORCH) && (y < V_ACTIVE + V_FRONT_PORCH + V_SYNC);

    assign hsync = H_SYNC_POLARITY ? h_sync_window : ~h_sync_window;
    assign vsync = V_SYNC_POLARITY ? v_sync_window : ~v_sync_window;
    assign de = (x < H_ACTIVE) && (y < V_ACTIVE);
    assign active_line_start = (x == 0) && (y < V_ACTIVE);
    assign frame_start = (x == 0) && (y == 0);
    assign line_start = (x == 0);

    always @(posedge clk) begin
        if (!reset_n) begin
            x <= 16'd0;
            y <= 16'd0;
        end else begin
            if (x == H_TOTAL - 1) begin
                x <= 16'd0;
                if (y == V_TOTAL - 1) y <= 16'd0;
                else y <= y + 16'd1;
            end else begin
                x <= x + 16'd1;
            end
        end
    end

    // Simulation-only sanity checks. These are not part of the synthesizable
    // logic; the testbench performs the same checks independently.
    // synthesis translate_off
    initial begin
        if (H_ACTIVE + H_FRONT_PORCH + H_SYNC + H_BACK_PORCH != H_TOTAL)
            $display("EVE timing parameter error");
    end
    // synthesis translate_on

endmodule

`default_nettype wire
