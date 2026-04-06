from PIL import Image, ImageDraw, ImageFont
import json, os, math

OUTPUT_DIR = "/home/claude/pyramids/images"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- 10 puzzles: (bottom_row, rule_bottom_to_mid, rule_mid_to_top, top_answer) ---
# Rules: 'add', 'multiply', 'subtract'
# We compute every level and pick which cells to hide (show '?')

def compute_pyramid(bottom, op1, op2):
    """Returns all rows bottom->top"""
    rows = [bottom]
    current = bottom
    ops = [op1, op2] if len(bottom) == 4 else [op1]
    def apply(a, b, op):
        if op == 'add': return a + b
        if op == 'multiply': return a * b
        if op == 'subtract': return abs(a - b)
    # Build up until single value
    step = 0
    while len(current) > 1:
        op = ops[min(step, len(ops)-1)]
        nxt = [apply(current[i], current[i+1], op) for i in range(len(current)-1)]
        rows.append(nxt)
        current = nxt
        step += 1
    return rows  # rows[0]=bottom, rows[-1]=[top]

puzzles_def = [
    # (bottom, op1, op2, hidden_cells_as_set_of_(row,col) 0-indexed from bottom)
    {"bottom":[3,5,2,4], "op1":"add", "op2":"multiply", "hide":[]},
    {"bottom":[1,10,6,3], "op1":"add", "op2":"add", "hide":[(0,1)]},          # hide one bottom
    {"bottom":[2,3,4,1], "op1":"add", "op2":"multiply", "hide":[(0,1),(0,2)]}, # hide two bottom
    {"bottom":[4,2,5,3], "op1":"add", "op2":"add", "hide":[(0,3)]},
    {"bottom":[1,6,2,5], "op1":"add", "op2":"multiply", "hide":[]},
    {"bottom":[3,4,1,6], "op1":"multiply", "op2":"add", "hide":[(0,0)]},
    {"bottom":[2,7,3,2], "op1":"add", "op2":"add", "hide":[(0,2)]},
    {"bottom":[5,1,4,3], "op1":"add", "op2":"multiply", "hide":[(0,1),(0,3)]},
    {"bottom":[1,3,5,2], "op1":"add", "op2":"add", "hide":[(0,0),(0,3)]},
    {"bottom":[6,2,3,1], "op1":"add", "op2":"multiply", "hide":[(0,1)]},
]

# Color palette
BG        = (248, 247, 244)
CELL_DEF  = (255, 255, 255)
CELL_GIV  = (230, 241, 251)  # blue tint – given numbers
CELL_TOP  = (234, 243, 222)  # green tint – top
CELL_HID  = (250, 238, 218)  # amber – hidden '?'
TEXT_GIV  = (12, 68, 124)
TEXT_TOP  = (39, 80, 10)
TEXT_HID  = (99, 56, 6)
TEXT_MID  = (60, 60, 60)
BORDER    = (180, 178, 170)
ACCENT    = (55, 138, 221)
TITLE_COL = (40, 40, 40)

W, H = 560, 520
CELL_W, CELL_H = 72, 60
CELL_R = 10
GAP = 10

def rounded_rect(draw, x, y, w, h, r, fill, border):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill, outline=border, width=2)

def draw_pyramid(rows_data, hidden_set, puzzle_num, op1, op2, answer_rows):
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Try to load a font
    try:
        font_big   = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_med   = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 17)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
        font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
        font_q     = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
    except:
        font_big = font_med = font_small = font_title = font_q = ImageFont.load_default()

    # Title bar
    draw.rectangle([0, 0, W, 54], fill=(45, 50, 80))
    draw.text((20, 14), f"Pyramid Puzzle #{puzzle_num}", fill=(255,255,255), font=font_title)

    # Rule badges
    op_label = {
        "add": "Bottom→Middle: Add (+)",
        "multiply": "Bottom→Middle: Multiply (×)",
        "subtract": "Bottom→Middle: Subtract (−)"
    }
    op2_label = {
        "add": "Middle→Top: Add (+)",
        "multiply": "Middle→Top: Multiply (×)",
        "subtract": "Middle→Top: Subtract (−)"
    }
    draw.text((20, 70), op_label[op1], fill=(80,80,80), font=font_small)
    draw.text((20, 88), op2_label[op2], fill=(80,80,80), font=font_small)

    n_rows = len(rows_data)
    start_y = 125

    for row_idx, row in enumerate(reversed(rows_data)):  # draw bottom->top visually reversed
        actual_row = n_rows - 1 - row_idx  # 0=bottom in data
        n_cells = len(row)
        total_w = n_cells * CELL_W + (n_cells - 1) * GAP
        start_x = (W - total_w) // 2

        for col_idx, val in enumerate(row):
            x = start_x + col_idx * (CELL_W + GAP)
            y = start_y + row_idx * (CELL_H + GAP)

            is_hidden = (actual_row, col_idx) in hidden_set
            is_top = actual_row == n_rows - 1
            is_bottom = actual_row == 0

            if is_hidden:
                fill, text_col = CELL_HID, TEXT_HID
                label = "?"
            elif is_top:
                fill, text_col = CELL_TOP, TEXT_TOP
                label = str(val)
            elif is_bottom:
                fill, text_col = CELL_GIV, TEXT_GIV
                label = str(val)
            else:
                fill, text_col = CELL_DEF, TEXT_MID
                label = "?"  # middle rows always hidden (player works them out)

            rounded_rect(draw, x, y, CELL_W, CELL_H, CELL_R, fill, BORDER)

            # Center text
            bb = draw.textbbox((0,0), label, font=font_big)
            tw, th = bb[2]-bb[0], bb[3]-bb[1]
            draw.text((x + (CELL_W-tw)//2, y + (CELL_H-th)//2 - 2), label, fill=text_col, font=font_big)

        # Draw operation arrow between rows
        if row_idx < n_rows - 1:
            op = op1 if row_idx == 0 else op2
            op_sym = {"add":"+", "multiply":"×", "subtract":"−"}[op]
            arrow_y = start_y + row_idx * (CELL_H + GAP) + CELL_H + 1
            draw.text((W//2 - 8, arrow_y), op_sym, fill=ACCENT, font=font_med)

    # Footer instruction
    draw.rectangle([0, H-44, W, H], fill=(235, 233, 228))
    draw.text((20, H-30), "Fill in all ? cells. Work your way up to find the top!", fill=(80,80,80), font=font_small)

    # Legend dots
    for lx, lc, lt in [(W-220, CELL_GIV, "Given"), (W-155, CELL_HID, "Find (?)"), (W-80, CELL_TOP, "Top")]:
        draw.rounded_rectangle([lx, H-34, lx+14, H-20], radius=3, fill=lc, outline=BORDER, width=1)
        draw.text((lx+18, H-34), lt, fill=(80,80,80), font=font_small)

    return img

answers_json = {}

for i, p in enumerate(puzzles_def, 1):
    bottom = p["bottom"]
    op1, op2 = p["op1"], p["op2"]
    hidden = set(map(tuple, p["hide"]))

    rows = compute_pyramid(bottom, op1, op2)

    img = draw_pyramid(rows, hidden, i, op1, op2, rows)
    fname = f"puzzle_{i:02d}.png"
    fpath = os.path.join(OUTPUT_DIR, fname)
    img.save(fpath, "PNG")

    # Build answer entry
    hidden_answers = {}
    for (r, c) in p["hide"]:
        hidden_answers[f"row{r}_col{c}"] = rows[r][c]

    answers_json[fname] = {
        "puzzle_number": i,
        "bottom_row": bottom,
        "rule_bottom_to_middle": op1,
        "rule_middle_to_top": op2,
        "all_rows": {
            f"row{j}": rows[j] for j in range(len(rows))
        },
        "top_answer": rows[-1][0],
        "hidden_cells_answers": hidden_answers,
        "full_solution": {
            "row0_bottom": rows[0],
            "row1_middle": rows[1] if len(rows) > 1 else [],
            "row2_middle": rows[2] if len(rows) > 2 else [],
            "row3_top": rows[-1]
        }
    }
    print(f"Generated puzzle_{i:02d}.png  top={rows[-1][0]}")

# Save JSON
json_path = "/home/claude/pyramids/answers.json"
with open(json_path, "w") as f:
    json.dump(answers_json, f, indent=2)

print("\nAll done! JSON saved.")
