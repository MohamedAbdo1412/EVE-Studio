// Verifies the EVE video timing generator against exact timing arithmetic.
//
// Profile selection:
//   vvp tb_eve_video_timing.vvp                  -> 320x180 fast functional timing
//   vvp tb_eve_video_timing.vvp +PROFILE=full    -> 1920x1080 @ 30 Hz reference timing
//
// The testbench observes the registered outputs only, so a failure points at
// the DUT rather than at testbench scheduling.
`timescale 1ns/1ps
`default_nettype none

module tb_eve_video_timing;

    reg clk = 1'b0;
    reg reset_n = 1'b0;

    // ---- fast functional timing instance -----------------------------------
    localparam integer F_H_ACTIVE = 320;
    localparam integer F_HFP      = 16;
    localparam integer F_HS       = 16;
    localparam integer F_HBP      = 48;
    localparam integer F_V_ACTIVE = 180;
    localparam integer F_VFP      = 2;
    localparam integer F_VS       = 2;
    localparam integer F_VBP      = 16;

    wire [15:0] fx, fy;
    wire fhsync, fvsync, fde, fframe_start, fline_start, factive_line_start;

    eve_video_timing #(
        .H_ACTIVE(F_H_ACTIVE), .H_FRONT_PORCH(F_HFP), .H_SYNC(F_HS), .H_BACK_PORCH(F_HBP),
        .V_ACTIVE(F_V_ACTIVE), .V_FRONT_PORCH(F_VFP), .V_SYNC(F_VS), .V_BACK_PORCH(F_VBP)
    ) fast_dut (
        .clk(clk), .reset_n(reset_n),
        .x(fx), .y(fy),
        .hsync(fhsync), .vsync(fvsync), .de(fde),
        .frame_start(fframe_start), .line_start(fline_start),
        .active_line_start(factive_line_start)
    );

    // ---- 1080p30 reference timing instance ---------------------------------
    localparam integer R_H_ACTIVE = 1920;
    localparam integer R_HFP      = 88;
    localparam integer R_HS       = 44;
    localparam integer R_HBP      = 148;
    localparam integer R_V_ACTIVE = 1080;
    localparam integer R_VFP      = 4;
    localparam integer R_VS       = 5;
    localparam integer R_VBP      = 36;

    wire [15:0] rx, ry;
    wire rhs, rvs, rde, rframe_start, rline_start, ractive_line_start;

    eve_video_timing #(
        .H_ACTIVE(R_H_ACTIVE), .H_FRONT_PORCH(R_HFP), .H_SYNC(R_HS), .H_BACK_PORCH(R_HBP),
        .V_ACTIVE(R_V_ACTIVE), .V_FRONT_PORCH(R_VFP), .V_SYNC(R_VS), .V_BACK_PORCH(R_VBP)
    ) full_dut (
        .clk(clk), .reset_n(reset_n),
        .x(rx), .y(ry),
        .hsync(rhs), .vsync(rvs), .de(rde),
        .frame_start(rframe_start), .line_start(rline_start),
        .active_line_start(ractive_line_start)
    );

    always #5 clk = ~clk;

    // ---- profile selection --------------------------------------------------
    reg        full_profile = 1'b0;
    string     profile_name;

    wire [15:0] x    = full_profile ? rx : fx;
    wire [15:0] y    = full_profile ? ry : fy;
    wire        hsync = full_profile ? rhs : fhsync;
    wire        vsync = full_profile ? rvs : fvsync;
    wire        de    = full_profile ? rde : fde;
    wire        frame_start = full_profile ? rframe_start : fframe_start;
    wire        line_start  = full_profile ? rline_start  : fline_start;

    integer H_ACTIVE, HFP, HS, HBP, V_ACTIVE, VFP, VS, VBP;
    integer H_TOTAL, V_TOTAL;
    integer FRAMES_TO_CHECK;

    initial begin
        if ($test$plusargs("PROFILE=full")) begin
            full_profile = 1'b1;
            H_ACTIVE = R_H_ACTIVE; HFP = R_HFP; HS = R_HS; HBP = R_HBP;
            V_ACTIVE = R_V_ACTIVE; VFP = R_VFP; VS = R_VS; VBP = R_VBP;
            FRAMES_TO_CHECK = 1;
        end else begin
            full_profile = 1'b0;
            H_ACTIVE = F_H_ACTIVE; HFP = F_HFP; HS = F_HS; HBP = F_HBP;
            V_ACTIVE = F_V_ACTIVE; VFP = F_VFP; VS = F_VS; VBP = F_VBP;
            FRAMES_TO_CHECK = 2;
        end
        H_TOTAL = H_ACTIVE + HFP + HS + HBP;
        V_TOTAL = V_ACTIVE + VFP + VS + VBP;
        profile_name = full_profile ? "1920x1080@30" : "320x180@60 (simulation)";
        $display("VIDEO TIMING VERIFICATION (functional timing generator, not HDMI/TMDS)");
        $display("EVE timing test profile: %0s  hTotal=%0d vTotal=%0d", profile_name, H_TOTAL, V_TOTAL);
    end

    // ---- checker ------------------------------------------------------------
    integer errors = 0;
    integer frames = 0;
    integer line_cycles = 0;
    integer frame_lines = 0;
    integer active_lines = 0;
    integer de_in_line = 0;
    integer hsync_run = 0;
    integer vsync_run = 0;
    integer frame_cycle_count = 0;
    integer cycle_count = 0;
    reg     finished = 1'b0;

    task automatic fail(input string message);
        begin
            errors = errors + 1;
            if (errors <= 20)
                $display("FAIL: %0s at %0t (x=%0d y=%0d)", message, $time, x, y);
        end
    endtask

    always @(posedge clk) begin
        if (reset_n && !finished) begin
            cycle_count = cycle_count + 1;
            frame_cycle_count = frame_cycle_count + 1;

            // Active region correctness.
            if (de) begin
                if (x >= H_ACTIVE) fail("de asserted beyond active width");
                if (y >= V_ACTIVE) fail("de asserted beyond active height");
                de_in_line = de_in_line + 1;
            end

            // Horizontal sync width, measured in cycles.
            if (hsync) begin
                hsync_run = hsync_run + 1;
            end else if (hsync_run > 0) begin
                if (hsync_run != HS) fail("hsync width mismatch");
                hsync_run = 0;
            end

            // Vertical sync width, measured in whole lines.
            if (vsync) begin
                vsync_run = vsync_run + 1;
            end else if (vsync_run > 0) begin
                if (vsync_run != VS * H_TOTAL) fail("vsync width mismatch");
                vsync_run = 0;
            end

            // End of line accounting.
            if (x == H_TOTAL - 1) begin
                if (line_cycles + 1 != H_TOTAL) fail("line length mismatch");
                line_cycles = 0;
                frame_lines = frame_lines + 1;
                if (y < V_ACTIVE) begin
                    active_lines = active_lines + 1;
                    if (de_in_line != H_ACTIVE) fail("active pixel count mismatch");
                end else if (de_in_line != 0) begin
                    fail("de asserted during vertical blanking");
                end
                de_in_line = 0;

                // End of frame accounting.
                if (y == V_TOTAL - 1) begin
                    if (frame_lines != V_TOTAL) fail("frame line count mismatch");
                    if (active_lines != V_ACTIVE) fail("active line count mismatch");
                    if (frame_cycle_count != H_TOTAL * V_TOTAL) fail("frame cycle count mismatch");
                    frames = frames + 1;
                    if (frames >= FRAMES_TO_CHECK) begin
                        finished = 1'b1;
                        if (errors == 0) begin
                            $display("PASS: VIDEO TIMING VERIFICATION %s verified over %0d frame(s) — hTotal=%0d vTotal=%0d active=%0dx%0d",
                                     profile_name, frames, H_TOTAL, V_TOTAL, H_ACTIVE, V_ACTIVE);
                        end else begin
                            $display("FAIL: VIDEO TIMING VERIFICATION %s had %0d error(s)", profile_name, errors);
                        end
                        $finish;
                    end
                    frame_lines = 0;
                    active_lines = 0;
                    frame_cycle_count = 0;
                end
            end else begin
                line_cycles = line_cycles + 1;
            end

            // frame_start must pulse once per frame at the first pixel.
            if (frame_start && !(x == 0 && y == 0)) fail("frame_start misaligned");
        end
    end

    // ---- run control --------------------------------------------------------
    initial begin
        reset_n = 1'b0;
        repeat (4) @(posedge clk);
        reset_n = 1'b1;
    end

    initial begin
        #4_000_000_000; // 400 ms wall-clock simulation guard
        if (!finished) begin
            $display("FAIL: timeout after %0d cycles", cycle_count);
            $finish;
        end
    end

endmodule

`default_nettype wire
