// RTL FUNCTIONAL RENDERER CAPTURE testbench for eve_renderer.
//
// Loads a scene package produced by the EVE hardware exporter, renders every
// pixel through the RTL compositor, writes a binary PPM (P6) image, and checks
// the capture against an independent, deliberately simple reference model.
//
// This is NOT an HDMI/TMDS pipeline test and it does not connect the renderer
// to the video timing generator. It verifies the functional compositor only.
//
// Plusargs:
//   +DIR=<path>   directory containing frame.meta, oam.hex, text.hex, font.hex
//   +OUT=<path>   output PPM path
//
// The reference model intentionally implements the corrected text semantics:
//   - only glyph columns with gx < text_length are sampled
//   - only the first glyph row (gy == 0) is rendered
//   - a nonzero A8 atlas byte paints the text color
//   - all other text pixels preserve the already-composited lower layer
`timescale 1ns/1ps
`default_nettype none

module tb_eve_frame_capture;

    localparam integer MAX_OBJECTS = 16;
    localparam integer TEXT_BYTES  = 4096;
    localparam integer FONT_BYTES  = 4096;
    localparam integer ATLAS_WIDTH = 128;
    localparam integer GLYPH_SIZE  = 8;
    localparam integer MAX_UNIQUE  = 64;

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

    // Local copy of the package. The reference model reads these arrays only.
    reg [159:0] oam_mem [0:MAX_OBJECTS-1];
    reg [7:0]   text_mem [0:TEXT_BYTES-1];
    reg [7:0]   font_mem [0:FONT_BYTES-1];

    string dir;
    string out_path;
    string first_error = "";

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
    integer i, g;
    integer px, py;
    integer non_background = 0;
    integer background_pixels = 0;
    integer zero_pixels = 0;
    integer unique_colors = 0;
    integer checks = 0;
    integer mismatches = 0;
    integer errors = 0;
    reg [63:0] checksum = 64'd0;

    // Coverage and text-region counters.
    reg coverage [0:MAX_OBJECTS-1];
    integer covered_objects = 0;
    integer visible_objects = 0;
    integer supported_visible = 0;
    integer unsupported_in_oam = 0;
    integer text_objects = 0;
    integer text_trailing_pixels = 0;
    integer text_trailing_errors = 0;
    integer text_repeat_pixels = 0;
    integer text_repeat_errors = 0;
    integer text_blank_pixels = 0;
    integer text_blank_errors = 0;
    integer text_active_pixels = 0;
    integer text_color_pixels = 0;
    integer glyph_zero_active_pixels = 0;
    integer expect_trailing = 0;
    integer expect_repeat = 0;
    integer has_blank_glyph = 0;
    integer has_glyph_zero = 0;

    integer seen_colors [0:MAX_UNIQUE-1];

    // Loop temporaries.
    integer t, tx, ty, tw, th, toff, tlen, lgx, lgy, llx, lly;
    integer scan_x, scan_y;
    reg [159:0] object_word;
    reg [7:0] tglyph, talpha;
    reg [23:0] actual_rgb, expected_rgb;

    task automatic fail_check(input string message);
        begin
            errors = errors + 1;
            if (first_error == "") first_error = message;
            $display("CHECK_FAIL: %0s", message);
        end
    endtask

    task automatic note_color(input [23:0] color);
        integer k;
        reg found;
        begin
            found = 1'b0;
            for (k = 0; k < unique_colors; k = k + 1) begin
                if (seen_colors[k] == color) found = 1'b1;
            end
            if (!found) begin
                if (unique_colors < MAX_UNIQUE) seen_colors[unique_colors] = color;
                unique_colors = unique_colors + 1;
            end
        end
    endtask

    function automatic [7:0] tb_atlas_byte;
        input [7:0] glyph;
        input integer lx;
        input integer ly;
        integer cell_y;
        integer cell_x;
        begin
            cell_y = ((glyph >> 4) * GLYPH_SIZE) + ly;
            cell_x = ((glyph & 8'h0f) * GLYPH_SIZE) + lx;
            if ((glyph < 8'd64) && (cell_y < (FONT_BYTES / ATLAS_WIDTH)) &&
                (cell_x < ATLAS_WIDTH))
                tb_atlas_byte = font_mem[cell_y * ATLAS_WIDTH + cell_x];
            else
                tb_atlas_byte = 8'd0;
        end
    endfunction

    function automatic tb_glyph_is_blank;
        input [7:0] glyph;
        integer x;
        integer y;
        begin
            tb_glyph_is_blank = 1'b1;
            for (y = 0; y < GLYPH_SIZE; y = y + 1) begin
                for (x = 0; x < GLYPH_SIZE; x = x + 1) begin
                    if (tb_atlas_byte(glyph, x, y) != 8'd0) tb_glyph_is_blank = 1'b0;
                end
            end
        end
    endfunction

    // Independent reference compositor. It uses the corrected text rules and
    // is intentionally separate from the RTL implementation under test.
    function automatic [23:0] render_expected;
        input integer sx;
        input integer sy;
        integer index;
        integer left, top, right, bottom, lx, ly, sw, gx, gy, off, len;
        reg [159:0] word;
        reg [23:0] color;
        reg [7:0] glyph, alpha;
        begin
            color = background_rgb;
            for (index = 0; index < obj_count; index = index + 1) begin
                word = oam_mem[index];
                if (word[131] == 1'b1) begin
                    left = word[13:3];
                    top = word[24:14];
                    right = left + word[35:25];
                    bottom = top + word[46:36];
                    if ((sx >= left) && (sx < right) && (sy >= top) && (sy < bottom)) begin
                        lx = sx - left;
                        ly = sy - top;
                        case (word[2:0])
                            3'd1: begin
                                color = {word[70:63], word[62:55], word[54:47]};
                            end
                            3'd2: begin
                                sw = word[102:95];
                                if ((lx < sw) || (ly < sw) ||
                                    (lx >= (word[35:25] - sw)) ||
                                    (ly >= (word[46:36] - sw)))
                                    color = {word[94:87], word[86:79], word[78:71]};
                                else
                                    color = {word[70:63], word[62:55], word[54:47]};
                            end
                            3'd3: begin
                                gx = lx >> 3;
                                gy = ly >> 3;
                                off = word[122:111];
                                len = word[130:123];
                                if ((gy == 0) && (gx < len) && ((off + gx) < TEXT_BYTES)) begin
                                    glyph = text_mem[off + gx];
                                    alpha = tb_atlas_byte(glyph, lx & 7, ly & 7);
                                    if (alpha != 8'd0)
                                        color = {word[70:63], word[62:55], word[54:47]};
                                end
                            end
                            default: begin
                                // Unsupported types never appear in a valid OAM.
                            end
                        endcase
                    end
                end
            end
            render_expected = color;
        end
    endfunction

    task automatic load_text(input integer fd, input integer which);
        integer index;
        begin
            for (index = 0; index < TEXT_BYTES; index = index + 1) begin
                scan_code = $fscanf(fd, "%h", byte_line);
                if (scan_code != 1) begin
                    fail_check($sformatf("text/font file ended at byte %0d", index));
                    index = TEXT_BYTES;
                end else begin
                    @(negedge clk);
                    if (which == 0) begin
                        text_we = 1'b1;
                        text_addr = index[11:0];
                        text_data = byte_line;
                        text_mem[index] = byte_line;
                    end else begin
                        font_we = 1'b1;
                        font_addr = index[11:0];
                        font_data = byte_line;
                        font_mem[index] = byte_line;
                    end
                    @(negedge clk);
                    if (which == 0) text_we = 1'b0;
                    else font_we = 1'b0;
                end
            end
        end
    endtask

    initial begin
        if (!$value$plusargs("DIR=%s", dir)) dir = ".";
        if (!$value$plusargs("OUT=%s", out_path)) out_path = "frame.ppm";

        $display("RTL FUNCTIONAL RENDERER CAPTURE (functional compositor, not HDMI/TMDS)");

        meta_fd = $fopen({dir, "/frame.meta"}, "r");
        if (meta_fd == 0) begin
            $display("FAIL: cannot open %0s/frame.meta", dir);
            $finish;
        end
        scan_code = $fscanf(meta_fd, "%d %d %d %h", width, height, obj_count, bg);
        $fclose(meta_fd);
        if (scan_code != 4) begin
            $display("FAIL: frame.meta must contain width height objectCount background");
            $finish;
        end
        if ((width < 1) || (height < 1) || (obj_count < 0) || (obj_count > MAX_OBJECTS)) begin
            $display("FAIL: invalid frame.meta dimensions/object count %0dx%0d, %0d objects", width, height, obj_count);
            $finish;
        end
        $display("Frame: %0dx%0d, %0d objects, background 0x%06h", width, height, obj_count, bg);

        // Initialise local arrays even when the input files are short.
        for (i = 0; i < MAX_OBJECTS; i = i + 1) oam_mem[i] = 160'd0;
        for (i = 0; i < TEXT_BYTES; i = i + 1) text_mem[i] = 8'd0;
        for (i = 0; i < FONT_BYTES; i = i + 1) font_mem[i] = 8'd0;

        oam_fd = $fopen({dir, "/oam.hex"}, "r");
        if (oam_fd == 0) begin
            $display("FAIL: cannot open %0s/oam.hex", dir);
            $finish;
        end
        for (i = 0; i < obj_count; i = i + 1) begin
            scan_code = $fscanf(oam_fd, "%h", oam_line);
            if (scan_code != 1) begin
                $display("FAIL: oam.hex ended before object %0d", i);
                $finish;
            end
            oam_mem[i] = oam_line;
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

        // Characterise the package before rendering.
        for (i = 0; i < obj_count; i = i + 1) begin
            coverage[i] = 1'b0;
            object_word = oam_mem[i];
            if (object_word[131] == 1'b1) begin
                visible_objects = visible_objects + 1;
                tx = object_word[13:3];
                ty = object_word[24:14];
                tw = object_word[35:25];
                th = object_word[46:36];
                case (object_word[2:0])
                    3'd1, 3'd2: begin
                        supported_visible = supported_visible + 1;
                        if ((tw > 0) && (th > 0) && (tx < width) && (ty < height) &&
                            ((tx + tw) > 0) && ((ty + th) > 0))
                            coverage[i] = 1'b1;
                    end
                    3'd3: begin
                        supported_visible = supported_visible + 1;
                        text_objects = text_objects + 1;
                        toff = object_word[122:111];
                        tlen = object_word[130:123];
                        if (tw > (tlen * 8)) expect_trailing = 1;
                        if (th > 8) expect_repeat = 1;
                        for (g = 0; g < tlen; g = g + 1) begin
                            if ((toff + g) < TEXT_BYTES) begin
                                tglyph = text_mem[toff + g];
                                if (tglyph == 8'd0) has_glyph_zero = 1;
                                if (tb_glyph_is_blank(tglyph)) has_blank_glyph = 1;
                            end
                        end
                        for (scan_y = ty; scan_y < (ty + th); scan_y = scan_y + 1) begin
                            for (scan_x = tx; scan_x < (tx + tw); scan_x = scan_x + 1) begin
                                if ((scan_x >= 0) && (scan_x < width) &&
                                    (scan_y >= 0) && (scan_y < height)) begin
                                    llx = scan_x - tx;
                                    lly = scan_y - ty;
                                    lgx = llx >> 3;
                                    lgy = lly >> 3;
                                    if ((lgy == 0) && (lgx < tlen) &&
                                        ((toff + lgx) < TEXT_BYTES)) begin
                                        tglyph = text_mem[toff + lgx];
                                        talpha = tb_atlas_byte(tglyph, llx & 7, lly & 7);
                                        if (talpha != 8'd0) coverage[i] = 1'b1;
                                    end
                                end
                            end
                        end
                    end
                    default: begin
                        unsupported_in_oam = unsupported_in_oam + 1;
                    end
                endcase
                if (coverage[i] == 1'b1) covered_objects = covered_objects + 1;
            end
        end

        if (unsupported_in_oam > 0) begin
            fail_check($sformatf(
                "OAM contains %0d object(s) with an unsupported RTL type", unsupported_in_oam));
        end

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
                actual_rgb = {cap_r, cap_g, cap_b};
                checksum = (checksum * 64'd1099511628211) ^ {cap_r, cap_g, cap_b};
                checks = checks + 1;

                expected_rgb = render_expected(px, py);
                if (actual_rgb !== expected_rgb) begin
                    mismatches = mismatches + 1;
                    if (first_error == "")
                        $sformat(first_error, "pixel (%0d,%0d) expected %06h got %06h",
                                 px, py, expected_rgb, actual_rgb);
                end

                if (actual_rgb == {bg[23:16], bg[15:8], bg[7:0]})
                    background_pixels = background_pixels + 1;
                else
                    non_background = non_background + 1;
                if (actual_rgb == 24'h000000) zero_pixels = zero_pixels + 1;
                note_color(actual_rgb);

                // Explicit text-region accounting for the acceptance criteria.
                for (t = 0; t < obj_count; t = t + 1) begin
                    object_word = oam_mem[t];
                    if ((object_word[131] == 1'b1) && (object_word[2:0] == 3'd3)) begin
                        tx = object_word[13:3];
                        ty = object_word[24:14];
                        tw = object_word[35:25];
                        th = object_word[46:36];
                        if ((px >= tx) && (px < (tx + tw)) &&
                            (py >= ty) && (py < (ty + th))) begin
                            llx = px - tx;
                            lly = py - ty;
                            lgx = llx >> 3;
                            lgy = lly >> 3;
                            toff = object_word[122:111];
                            tlen = object_word[130:123];
                            if (lgy > 0) begin
                                text_repeat_pixels = text_repeat_pixels + 1;
                                if (actual_rgb !== expected_rgb) text_repeat_errors = text_repeat_errors + 1;
                            end else if (lgx >= tlen) begin
                                text_trailing_pixels = text_trailing_pixels + 1;
                                if (actual_rgb !== expected_rgb) text_trailing_errors = text_trailing_errors + 1;
                            end else if ((toff + lgx) < TEXT_BYTES) begin
                                tglyph = text_mem[toff + lgx];
                                talpha = tb_atlas_byte(tglyph, llx & 7, lly & 7);
                                if (talpha == 8'd0) begin
                                    text_blank_pixels = text_blank_pixels + 1;
                                    if (actual_rgb !== expected_rgb) text_blank_errors = text_blank_errors + 1;
                                end else begin
                                    text_active_pixels = text_active_pixels + 1;
                                    if (tglyph == 8'd0) glyph_zero_active_pixels = glyph_zero_active_pixels + 1;
                                    if (actual_rgb == {object_word[70:63], object_word[62:55], object_word[54:47]})
                                        text_color_pixels = text_color_pixels + 1;
                                end
                            end
                        end
                    end
                end
            end
        end

        $fclose(out_fd);

        if (mismatches > 0) begin
            fail_check($sformatf("%0d pixel(s) differ from the reference compositor", mismatches));
        end
        if (text_trailing_errors > 0) begin
            fail_check($sformatf("%0d pixel(s) after text_length changed the lower layer",
                                 text_trailing_errors));
        end
        if (text_repeat_errors > 0) begin
            fail_check($sformatf("%0d pixel(s) below the first glyph row repeated text",
                                 text_repeat_errors));
        end
        if (text_blank_errors > 0) begin
            fail_check($sformatf("%0d transparent/space glyph pixel(s) changed the lower layer",
                                 text_blank_errors));
        end
        if ((expect_trailing != 0) && (text_trailing_pixels == 0)) begin
            fail_check("fixture declares trailing text columns but none were checked");
        end
        if ((expect_repeat != 0) && (text_repeat_pixels == 0)) begin
            fail_check("fixture is taller than 8 px but no repeated-line pixels were checked");
        end
        if ((has_blank_glyph != 0) && (text_blank_pixels == 0)) begin
            fail_check("text contains a blank glyph but no blank glyph pixels were checked");
        end
        if ((has_glyph_zero != 0) && (glyph_zero_active_pixels == 0)) begin
            fail_check("glyph index 0 is present but rendered no active pixels");
        end
        if ((text_objects > 0) && (text_active_pixels == 0)) begin
            fail_check("text objects rendered no active glyph pixels");
        end
        if ((text_objects > 0) && (text_color_pixels == 0)) begin
            fail_check("text pixels did not use the text object's RGB color");
        end
        if ((visible_objects > 0) && (non_background == 0)) begin
            fail_check("all rendered pixels equal the background although objects are visible");
        end
        if ((visible_objects > 0) && (zero_pixels == (width * height))) begin
            fail_check("the complete capture is zero (all pixels are black)");
        end
        if (visible_objects != supported_visible) begin
            fail_check("OAM contains visible objects the RTL renderer cannot render");
        end
        if (covered_objects != supported_visible) begin
            fail_check($sformatf(
                "object coverage %0d/%0d; one or more objects are missing or outside the frame",
                covered_objects, supported_visible));
        end

        $display("FRAME_SUMMARY width=%0d height=%0d objects=%0d visible=%0d coverage=%0d checks=%0d mismatches=%0d zero=%0d background=%0d non_background=%0d unique_colors=%0d text_trailing=%0d text_repeat=%0d text_blank=%0d glyph_zero=%0d checksum=%016h errors=%0d",
                 width, height, obj_count, visible_objects, covered_objects, checks, mismatches,
                 zero_pixels, background_pixels, non_background, unique_colors,
                 text_trailing_pixels, text_repeat_pixels, text_blank_pixels,
                 glyph_zero_active_pixels, checksum, errors);

        if (errors == 0) begin
            $display("PASS: RTL FUNCTIONAL RENDERER CAPTURE verified %0dx%0d, %0d/%0d objects covered, %0d pixel checks, 0 errors, non-background %0d, unique colors %0d, checksum %016h",
                     width, height, covered_objects, supported_visible, checks,
                     non_background, unique_colors, checksum);
        end else begin
            if (first_error == "") first_error = "unspecified check failure";
            $display("FAIL: RTL FUNCTIONAL RENDERER CAPTURE %0d error(s); first: %0s",
                     errors, first_error);
        end
        $finish;
    end

    initial begin
        #60_000_000_000;
        $display("FAIL: frame capture timeout");
        $finish;
    end

endmodule

`default_nettype wire
