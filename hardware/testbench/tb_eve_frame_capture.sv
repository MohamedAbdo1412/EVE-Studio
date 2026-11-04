// Frame-capture testbench for eve_renderer.
//
// Loads a scene package produced by the EVE hardware exporter, renders every
// pixel through the RTL compositor, and writes a binary PPM (P6) image.
//
// Plusargs:
//   +DIR=<path>   directory containing frame.meta, oam.hex, text.hex, font.hex
//   +OUT=<path>   output PPM path
//
// The rendered image is produced by the RTL only. No JavaScript renderer is
// involved. This testbench is a functional capture harness, not an HDMI/TMDS
// transmitter.
`timescale 1ns/1ps
`default_nettype none

module tb_eve_frame_capture;

    localparam integer MAX_OBJECTS = 16;
    localparam integer TEXT_BYTES  = 4096;
    localparam integer FONT_BYTES  = 4096;

    reg clk = 1'b0;
    reg reset_n = 1'b0;
    always #5 clk = ~clk;

    // DUT connections.
    reg  [23:0] background_rgb = 24'h000000;
    reg  [7:0]  object_count = 8'd0;
    reg         pixel_req = 1'b0;
    reg  [15:0] pixel_x = 16'd0;
    reg  [15:0] pixel_y = 16'd0;
    wire        ready;
    wire        pixel_valid;
    wire [7:0]  pixel_r, pixel_g, pixel_b;

    reg         oam_we = 1'b0;
    reg  [4:0]  oam_index = 5'd0;
    reg  [159:0] oam_data = 160'd0;
    reg         text_we = 1'b0;
    reg  [11:0] text_addr = 12'd0;
    reg  [7:0]  text_data = 8'd0;
    reg         font_we = 1'b0;
    reg  [11:0] font_addr = 12'd0;
    reg  [7:0]  font_data = 8'd0;

    eve_renderer #(
        .MAX_OBJECTS(MAX_OBJECTS),
        .TEXT_BYTES(TEXT_BYTES),
        .FONT_BYTES(FONT_BYTES)
    ) dut (
        .clk(clk),
        .reset_n(reset_n),
        .background_rgb(background_rgb),
        .object_count(object_count),
        .pixel_req(pixel_req),
        .pixel_x(pixel_x),
        .pixel_y(pixel_y),
        .ready(ready),
        .pixel_valid(pixel_valid),
        .pixel_r(pixel_r),
        .pixel_g(pixel_g),
        .pixel_b(pixel_b),
        .oam_we(oam_we),
        .oam_index(oam_index),
        .oam_data(oam_data),
        .text_we(text_we),
        .text_addr(text_addr),
        .text_data(text_data),
        .font_we(font_we),
        .font_addr(font_addr),
        .font_data(font_data)
    );

    // Captured pixel.
    reg [7:0] cap_r = 8'd0;
    reg [7:0] cap_g = 8'd0;
    reg [7:0] cap_b = 8'd0;
    reg       cap_ready = 1'b0;

    always @(posedge clk) begin
        if (pixel_valid) begin
            cap_r <= pixel_r;
            cap_g <= pixel_g;
            cap_b <= pixel_b;
            cap_ready <= 1'b1;
        end
    end

    string dir;
    string out_path;

    integer width = 0;
    integer height = 0;
    integer obj_count = 0;
    integer bg = 0;

    integer meta_fd;
    integer oam_fd;
    integer text_fd;
    integer font_fd;
    integer out_fd;
    integer scan_code;

    reg [159:0] oam_line;
    reg [7:0]   byte_line;
    integer i;
    integer px, py;
    integer non_background = 0;
    reg [63:0] checksum = 64'd0;

    task automatic load_text(input integer fd, input integer which);
        integer index;
        begin
            for (index = 0; index < TEXT_BYTES; index = index + 1) begin
                scan_code = $fscanf(fd, "%h", byte_line);
                @(negedge clk);
                if (which == 0) begin
                    text_we = 1'b1;
                    text_addr = index[11:0];
                    text_data = byte_line;
                end else begin
                    font_we = 1'b1;
                    font_addr = index[11:0];
                    font_data = byte_line;
                end
                @(negedge clk);
                if (which == 0) text_we = 1'b0;
                else font_we = 1'b0;
            end
        end
    endtask

    initial begin
        if (!$value$plusargs("DIR=%s", dir)) dir = ".";
        if (!$value$plusargs("OUT=%s", out_path)) out_path = "frame.ppm";

        meta_fd = $fopen({dir, "/frame.meta"}, "r");
        if (meta_fd == 0) begin
            $display("FAIL: cannot open %0s/frame.meta", dir);
            $finish;
        end
        scan_code = $fscanf(meta_fd, "%d %d %d %h", width, height, obj_count, bg);
        $fclose(meta_fd);
        $display("EVE frame capture: %0dx%0d, %0d objects, background 0x%06h", width, height, obj_count, bg);

        oam_fd = $fopen({dir, "/oam.hex"}, "r");
        if (oam_fd == 0) begin
            $display("FAIL: cannot open %0s/oam.hex", dir);
            $finish;
        end
        for (i = 0; i < obj_count; i = i + 1) begin
            scan_code = $fscanf(oam_fd, "%h", oam_line);
            @(negedge clk);
            oam_we = 1'b1;
            oam_index = i[4:0];
            oam_data = oam_line;
            @(negedge clk);
            oam_we = 1'b0;
        end
        $fclose(oam_fd);

        text_fd = $fopen({dir, "/text.hex"}, "r");
        if (text_fd == 0) begin
            $display("FAIL: cannot open %0s/text.hex", dir);
            $finish;
        end
        load_text(text_fd, 0);
        $fclose(text_fd);

        font_fd = $fopen({dir, "/font.hex"}, "r");
        if (font_fd == 0) begin
            $display("FAIL: cannot open %0s/font.hex", dir);
            $finish;
        end
        load_text(font_fd, 1);
        $fclose(font_fd);

        background_rgb = bg[23:0];
        object_count = obj_count[7:0];

        repeat (4) @(negedge clk);
        reset_n = 1'b1;
        repeat (2) @(negedge clk);

        out_fd = $fopen(out_path, "wb");
        if (out_fd == 0) begin
            $display("FAIL: cannot open output %0s", out_path);
            $finish;
        end
        $fwrite(out_fd, "P6\n%0d %0d\n255\n", width, height);

        for (py = 0; py < height; py = py + 1) begin
            for (px = 0; px < width; px = px + 1) begin
                // Wait until the renderer is idle before starting the next pixel.
                while (!ready) @(negedge clk);
                @(negedge clk);
                pixel_req = 1'b1;
                pixel_x = px[15:0];
                pixel_y = py[15:0];
                @(negedge clk);
                pixel_req = 1'b0;
                cap_ready = 1'b0;
                while (!cap_ready) @(negedge clk);
                $fwrite(out_fd, "%c%c%c", cap_r, cap_g, cap_b);
                checksum = (checksum * 64'd1099511628211) ^ {cap_r, cap_g, cap_b};
                if (!(cap_r == bg[23:16] && cap_g == bg[15:8] && cap_b == bg[7:0]))
                    non_background = non_background + 1;
            end
        end

        $fclose(out_fd);
        $display("PASS: rendered %0dx%0d = %0d pixels, non-background %0d, checksum %016h",
                 width, height, width * height, non_background, checksum);
        $finish;
    end

    initial begin
        #60_000_000_000;
        $display("FAIL: frame capture timeout");
        $finish;
    end

endmodule

`default_nettype wire
