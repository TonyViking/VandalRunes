/**
 * assets.js — Sprite asset loader with fallbacks for missing art.
 *
 * Port of src/assets.py. Loads PNGs from Sprites/, crops measured
 * letter/digit/button regions from the 230x230 sprite sheets, and
 * provides fallbacks (null) so the game still runs while art is
 * incomplete.
 */

// Map game.js colour names to sprite sheet colour names.
const GAME_COLOUR_TO_SPRITE = {
    "green": "green",
    "yellow": "orange",
    "gray": "gray",
};

// Letter crop boxes [x, y, w, h] from the 230x230 sprite sheets.
// All letters are 27x34 pixels.
const LETTER_CROPS = {
    A: [24, 2, 27, 34],   B: [57, 2, 27, 34],   C: [89, 2, 27, 34],
    D: [119, 2, 27, 34],  E: [151, 2, 27, 34],  F: [184, 2, 27, 34],
    G: [24, 50, 27, 34],  H: [57, 50, 27, 34],  I: [89, 50, 27, 34],
    J: [119, 50, 27, 34], K: [151, 50, 27, 34], L: [184, 50, 27, 34],
    M: [24, 98, 27, 34],  N: [57, 98, 27, 34],  O: [89, 98, 27, 34],
    P: [119, 98, 27, 34], Q: [151, 98, 27, 34], R: [184, 98, 27, 34],
    S: [24, 146, 27, 34], T: [57, 146, 27, 34], U: [89, 146, 27, 34],
    V: [119, 146, 27, 34], W: [151, 146, 27, 34], X: [184, 146, 27, 34],
    Y: [23, 194, 27, 34], Z: [56, 194, 27, 34],
};

// Digit crop boxes from "Number Sprites.png" (630x254, 2 rows x 5 columns)
const DIGIT_CROPS = {
    0: [42, 17, 49, 100],   1: [172, 18, 36, 102],  2: [293, 17, 51, 99],
    3: [419, 18, 52, 99],  4: [539, 20, 51, 100],
    5: [45, 147, 48, 94],  6: [164, 143, 51, 96],  7: [284, 141, 60, 100],
    8: [414, 141, 56, 107], 9: [541, 136, 55, 107],
};

// High-score digit crop boxes from "Number Sprites - High Score.png"
const HS_DIGIT_CROPS = {
    0: [44, 0, 47, 114],    1: [175, 2, 37, 111],   2: [292, 0, 51, 110],
    3: [418, 2, 54, 110],   4: [543, 6, 47, 104],
    5: [45, 130, 51, 116],  6: [161, 129, 55, 117], 7: [287, 130, 54, 116],
    8: [413, 121, 60, 127], 9: [541, 125, 57, 122],
};

// Content boxes for non-sheet sprites [x, y, w, h]
const CONTENT_BOXES = {
    Title:              [19, 31, 135, 115],
    Says_Start:         [26, 39, 128, 84],
    Says_Back:          [20, 39, 125, 84],
    Says_enter:         [19, 36, 135, 88],
    Says_Hard:          [19, 36, 135, 92],
    Says_Quit:          [31, 20, 115, 134],
    CURRENT_Sprite:     [1, 51, 167, 51],
    HIGH_SCORE_sprite:  [0, 33, 165, 57],
    CLICK_TO_CONTINUE:  [3, 21, 164, 134],
    Main_Menu:          [22, 28, 122, 119],
    Help:              [22, 77, 189, 87],
};

// Help screen sprites (loaded as full surfaces, no crop — they have
// transparent padding and are sized to fit the 504px wide screen)
const HELP_SPRITES = [
    "Guess_the_hidden_5-letter_word.png",
    "Green_right_letter_right_s.png",
    "Orange_right_letter_wrong.png",
    "Gray_letter_not_in_the_word.png",
    "Solve_words_in_a_row_to_build.png",
    "Hard_mode_Reuse_revealed_lette.png",
    "Last_guess_Easy_mode_shows_a.png",
];

// Letter sheet filenames by colour
const LETTER_SHEETS = {
    green:  "new a-z Green.png",
    red:    "new a-z Red.png",
    gray:   "new a-z Gray.png",
    teal:   "new a-z Teal.png",
    purple: "new a-z Purple.png",
    orange: "new a-z Orange.png",
};

// "No points" stamp images
const STAMP_FILES = [
    "No_points_-_last_guess.png",
    "last_guess_-_no_point_given.png",
    "Close_but_no_points_this_roun.png",
    "no_points_for_you_but_you_can.png",
];

class AssetLoader {
    constructor(spritesDir) {
        this.spritesDir = spritesDir;
        this.letterSurfs = {}; // {colour: {letter: canvas}}
        this.digitSurfs = {};  // {digit: canvas}
        this.hsDigitSurfs = {}; // {digit: canvas}
        this.buttonSurfs = {}; // {name: canvas}
        this.bgSurfs = [];    // [canvas, ...]
        this.titleBgSurf = null;
        this.titleSurf = null;
        this.stampSurfs = []; // [canvas, ...]
        this.loaded = false;
    }

    /**
     * Load all assets asynchronously. Returns a Promise that resolves
     * when all images are loaded (or failed).
     */
    async loadAll() {
        const promises = [];

        // Letter sheets
        for (const [colour, filename] of Object.entries(LETTER_SHEETS)) {
            this.letterSurfs[colour] = {};
            promises.push(this._loadSheet(filename).then(img => {
                if (!img) return;
                for (const [letter, crop] of Object.entries(LETTER_CROPS)) {
                    this.letterSurfs[colour][letter] = this._cropToCanvas(img, crop);
                }
            }));
        }

        // Digit sheet
        promises.push(this._loadSheet("Number Sprites.png").then(img => {
            if (!img) return;
            for (const [digit, crop] of Object.entries(DIGIT_CROPS)) {
                this.digitSurfs[parseInt(digit)] = this._cropToCanvas(img, crop);
            }
        }));

        // High-score digit sheet
        promises.push(this._loadSheet("Number Sprites - High Score.png").then(img => {
            if (!img) return;
            for (const [digit, crop] of Object.entries(HS_DIGIT_CROPS)) {
                this.hsDigitSurfs[parseInt(digit)] = this._cropToCanvas(img, crop);
            }
        }));

        // Buttons and labels (crop to content)
        for (const [name, box] of Object.entries(CONTENT_BOXES)) {
            promises.push(this._loadSheet(name + ".png").then(img => {
                if (!img) return;
                this.buttonSurfs[name] = this._cropToCanvas(img, box);
            }));
        }

        // Gameplay backgrounds
        for (let i = 1; i <= 4; i++) {
            promises.push(this._loadSheet(`BG${i}.png`).then(img => {
                if (img) this.bgSurfs.push(img);
            }));
        }

        // Title background (full surface, no crop)
        promises.push(this._loadSheet("TitleBackground.png").then(img => {
            this.titleBgSurf = img;
        }));

        // Title logo (cropped to content)
        promises.push(this._loadSheet("Title.png").then(img => {
            if (!img) return;
            this.titleSurf = this._cropToCanvas(img, CONTENT_BOXES["Title"]);
        }));

        // Stamp images (full surfaces, no crop)
        for (const filename of STAMP_FILES) {
            promises.push(this._loadSheet(filename).then(img => {
                if (img) this.stampSurfs.push(img);
            }));
        }

        // Help screen sprites (full surfaces, no crop)
        this.helpSurfs = {};
        for (const filename of HELP_SPRITES) {
            promises.push(this._loadSheet(filename).then(img => {
                if (img) this.helpSurfs[filename.replace(".png", "")] = img;
            }));
        }

        await Promise.all(promises);
        this.loaded = true;
    }

    _loadSheet(filename) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = `${this.spritesDir}/${filename}`;
        });
    }

    _cropToCanvas(img, [x, y, w, h]) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        return canvas;
    }

    // --- Accessors ---

    getLetter(colour, letter) {
        return (this.letterSurfs[colour] || {})[letter] || null;
    }

    getDigit(digit) {
        return this.digitSurfs[digit] || null;
    }

    getHsDigit(digit) {
        return this.hsDigitSurfs[digit] || null;
    }

    getButton(name) {
        return this.buttonSurfs[name] || null;
    }

    getBackground() {
        if (!this.bgSurfs.length) return null;
        return this.bgSurfs[Math.floor(Math.random() * this.bgSurfs.length)];
    }

    getTitleBackground() {
        return this.titleBgSurf;
    }

    getTitle() {
        return this.titleSurf;
    }

    getStamp() {
        if (!this.stampSurfs.length) return null;
        return this.stampSurfs[Math.floor(Math.random() * this.stampSurfs.length)];
    }

    hasStamps() {
        return this.stampSurfs.length > 0;
    }

    hasDigits() {
        return Object.keys(this.digitSurfs).length > 0;
    }

    hasHsDigits() {
        return Object.keys(this.hsDigitSurfs).length > 0;
    }

    getHelpSprite(name) {
        return this.helpSurfs[name] || null;
    }
}