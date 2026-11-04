// EVE functional scene renderer (reference vertical slice).
//
// This is a synthesizable, deterministic compositor that turns EVE scene
// records into RGB888 pixels. It is deliberately simple: one pixel is rendered
// per request, iterating the object list in the order supplied by the host.
// The host must pre-sort objects by ascending z-order.
//
// Supported object types:
//   1  RECT          solid filled rectangle
//   2  BORDER_RECT   filled rectangle with an inset stroke ring
//   3  TEXT          single row of 8x8 A8 glyphs, glyph indices in text RAM
//
// Unsupported by this version (reported by the frame packer, never silently
// flattened into rectangles): IMAGE, VIDEO, ROUND_RECT, CIRCLE, LINE and GROUP.
//
// The text RAM is 4096 bytes. Object records carry a 12-bit text offset and an
// 8-bit glyph count; the host packer/ROM validator rejects references outside
// those limits instead of masking them.
//
// Throughput: one pixel per (object_count + 2) clocks. This is a functional
// reference core for simulation and frame capture. It is NOT a real-time
// 1080p30 scanout pipeline and no vendor timing closure is claimed.
//
// Object record (160 bits, little-field order):
//   [2:0]    type
//   [13:3]   x
//   [24:14]  y
//   [35:25]  width
//   [46:36]  height
//   [70:47]  fill RGB (R<<16 | G<<8 | B)
//   [94:71]  stroke RGB
//   [102:95] stroke width in pixels
//   [110:103] z order (informational; host order rules)
//   [122:111] glyph text offset
//   [130:123] glyph text length
//   [131]    visible
//   [132]    centre text
`timescale 1ns/1ps
`default_nettype none

module eve_renderer #(
    parameter integer MAX_OBJECTS = 16,
    parameter integer TEXT_BYTES  = 4096,
    parameter integer FONT_BYTES  = 4096,
    parameter integer GLYPH_SIZE  = 8,
    parameter integer ATLAS_WIDTH = 128
) (
    input  wire        clk,
    input  wire        reset_n,

    input  wire [23:0] background_rgb,
    input  wire [7:0]  object_count,

    // Pixel request / response. Assert request while idle; the renderer replies
    // with a single-cycle pixel_valid pulse.
    input  wire        pixel_req,
    input  wire [15:0] pixel_x,
    input  wire [15:0] pixel_y,
    output reg         ready,
    output reg         pixel_valid,
    output reg  [7:0]  pixel_r,
    output reg  [7:0]  pixel_g,
    output reg  [7:0]  pixel_b,

    // Object attribute memory write port (host loader).
    input  wire        oam_we,
    input  wire [4:0]  oam_index,
    input  wire [159:0] oam_data,

    // Glyph index RAM write port.
    input  wire        text_we,
    input  wire [11:0] text_addr,
    input  wire [7:0]  text_data,

    // Font atlas RAM write port.
    input  wire        font_we,
    input  wire [11:0] font_addr,
    input  wire [7:0]  font_data
);

    localparam integer TYPE_RECT        = 1;
    localparam integer TYPE_BORDER_RECT = 2;
    localparam integer TYPE_TEXT        = 3;

    localparam integer S_IDLE = 2'd0;
    localparam integer S_OBJ  = 2'd1;
    localparam integer S_DONE = 2'd2;

    reg [159:0] oam_mem [0:MAX_OBJECTS-1];
    reg [7:0]   text_mem [0:TEXT_BYTES-1];
    reg [7:0]   font_mem [0:FONT_BYTES-1];

    integer init_index;
    initial begin
        for (init_index = 0; init_index < MAX_OBJECTS; init_index = init_index + 1)
            oam_mem[init_index] = 160'd0;
        for (init_index = 0; init_index < TEXT_BYTES; init_index = init_index + 1)
            text_mem[init_index] = 8'd0;
        for (init_index = 0; init_index < FONT_BYTES; init_index = init_index + 1)
            font_mem[init_index] = 8'd0;
    end

    always @(posedge clk) begin
        if (oam_we) oam_mem[oam_index] <= oam_data;
        if (text_we) text_mem[text_addr] <= text_data;
        if (font_we) font_mem[font_addr] <= font_data;
    end

    // Host-side visibility for the frame-capture testbench.
    wire [159:0] oam_peek = oam_mem[0];

    reg [1:0]  state;
    reg [7:0]  obj_index;
    reg [15:0] cur_x;
    reg [15:0] cur_y;
    reg [7:0]  cur_r;
    reg [7:0]  cur_g;
    reg [7:0]  cur_b;
    integer    local_x;
    integer    local_y;

    // Pure function: return true when the pixel lies inside the object box.
    function automatic in_box;
        input [15:0] px;
        input [15:0] py;
        input [10:0] ox;
        input [10:0] oy;
        input [10:0] ow;
        input [10:0] oh;
        begin
            in_box = (px >= {5'b0, ox}) && (px < ({5'b0, ox} + {5'b0, ow})) &&
                     (py >= {5'b0, oy}) && (py < ({5'b0, oy} + {5'b0, oh}));
        end
    endfunction

    // Combinational glyph bit lookup used by the TEXT object branch.
    function automatic [7:0] atlas_byte;
        input [7:0]  glyph;
        input integer lx;
        input integer ly;
        integer cell_y;
        integer cell_x;
        begin
            cell_y = ((glyph >> 4) * GLYPH_SIZE) + ly;
            cell_x = ((glyph & 8'h0f) * GLYPH_SIZE) + lx;
            // The built-in atlas contains 64 8x8 cells (4 rows). A glyph index
            // outside that range has no cell; render it as fully transparent.
            if ((glyph < 8'd64) && (cell_y < (FONT_BYTES / ATLAS_WIDTH)) &&
                (cell_x < ATLAS_WIDTH))
                atlas_byte = font_mem[cell_y * ATLAS_WIDTH + cell_x];
            else
                atlas_byte = 8'd0;
        end
    endfunction

    reg [159:0] obj;
    reg [10:0]  ox, oy, ow, oh;
    reg [7:0]   sw;
    reg [7:0]   glyph;
    reg [7:0]   row_byte;
    integer     gx, gy;
    integer     text_offset;
    integer     text_length;
    reg         hit;
    reg         struck;

    always @(posedge clk) begin
        if (!reset_n) begin
            state <= S_IDLE;
            ready <= 1'b1;
            pixel_valid <= 1'b0;
            obj_index <= 8'd0;
            cur_r <= 8'd0;
            cur_g <= 8'd0;
            cur_b <= 8'd0;
            cur_x <= 16'd0;
            cur_y <= 16'd0;
        end else begin
            pixel_valid <= 1'b0;
            case (state)
                S_IDLE: begin
                    ready <= 1'b1;
                    if (pixel_req) begin
                        cur_x <= pixel_x;
                        cur_y <= pixel_y;
                        cur_r <= background_rgb[23:16];
                        cur_g <= background_rgb[15:8];
                        cur_b <= background_rgb[7:0];
                        obj_index <= 8'd0;
                        ready <= 1'b0;
                        state <= S_OBJ;
                    end
                end

                S_OBJ: begin
                    ready <= 1'b0;
                    if (obj_index >= object_count) begin
                        state <= S_DONE;
                    end else begin
                        obj = oam_mem[obj_index];
                        if (obj[131] === 1'b1) begin
                            ox = obj[13:3];
                            oy = obj[24:14];
                            ow = obj[35:25];
                            oh = obj[46:36];
                            hit = in_box(cur_x, cur_y, ox, oy, ow, oh);
                            if (hit) begin
                                local_x = cur_x - {5'b0, ox};
                                local_y = cur_y - {5'b0, oy};
                                case (obj[2:0])
                                    TYPE_RECT: begin
                                        cur_r <= obj[70:63];
                                        cur_g <= obj[62:55];
                                        cur_b <= obj[54:47];
                                    end
                                    TYPE_BORDER_RECT: begin
                                        sw = obj[102:95];
                                        struck = (local_x < sw) || (local_y < sw) ||
                                                 (local_x >= (ow - sw)) || (local_y >= (oh - sw));
                                        if (struck) begin
                                            cur_r <= obj[94:87];
                                            cur_g <= obj[86:79];
                                            cur_b <= obj[78:71];
                                        end else begin
                                            cur_r <= obj[70:63];
                                            cur_g <= obj[62:55];
                                            cur_b <= obj[54:47];
                                        end
                                    end
                                    TYPE_TEXT: begin
                                        // Text is a single row of 8x8 glyph cells.
                                        // The glyph-index byte is an A8 alpha sample:
                                        // any nonzero value paints the text color.
                                        // No fallback glyph is substituted, so cells
                                        // after text_length and rows below gy==0 keep
                                        // the already-composited lower-layer pixel.
                                        text_offset = obj[122:111];
                                        text_length = obj[130:123];
                                        gx = local_x >> 3;
                                        gy = local_y >> 3;
                                        if ((gy == 0) && (gx < text_length) &&
                                            ((text_offset + gx) < TEXT_BYTES)) begin
                                            glyph = text_mem[text_offset + gx];
                                            row_byte = atlas_byte(glyph, local_x & 7, local_y & 7);
                                            if (row_byte != 8'd0) begin
                                                cur_r <= obj[70:63];
                                                cur_g <= obj[62:55];
                                                cur_b <= obj[54:47];
                                            end
                                        end
                                    end
                                    default: begin
                                        // Unknown object type is ignored rather than guessed.
                                    end
                                endcase
                            end
                        end
                        obj_index <= obj_index + 8'd1;
                    end
                end

                S_DONE: begin
                    ready <= 1'b1;
                    pixel_valid <= 1'b1;
                    pixel_r <= cur_r;
                    pixel_g <= cur_g;
                    pixel_b <= cur_b;
                    state <= S_IDLE;
                end

                default: state <= S_IDLE;
            endcase
        end
    end

endmodule

`default_nettype wire
