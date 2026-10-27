/**
 * display.js — Canvas rendering for the offline endless Wordle game.
 *
 * Port of src/display.py. Draws the 6x5 guess grid and on-screen
 * QWERTY keyboard using sprite art from Sprites/, with fallbacks to
 * default font when art is missing. Includes title screen, gameplay
 * backgrounds, integer window scaling, particle effects (confetti,
 * fireworks, ambient), stamp effects (spring physics), and hover/click
 * animations.
 */

// --- Layout constants (base / virtual resolution) ---

const BASE_W = 504;
const BASE_H = 672;

// Grid
const TILE_SIZE = 50;
const TILE_GAP = 6;
const GRID_TOP = 110;
const GRID_LEFT = Math.floor((BASE_W - (5 * TILE_SIZE + 4 * TILE_GAP)) / 2); // 115

// Keyboard
const KEYBOARD_TOP = 460;
const KEY_W = 44;
const KEY_H = 52;
const KEY_GAP = 6;
const BOTTOM_KEY_W = 34;

// Hard mode button (top-right)
const HARD_BTN_X = BASE_W - 135 - 8; // 361
const HARD_BTN_Y = 8;
const HARD_BTN_W = 135;
const HARD_BTN_H = 92;

// Hint area (top-middle)
const HINT_LEFT = 140;
const HINT_RIGHT = HARD_BTN_X - 4; // 357
const HINT_W = HINT_RIGHT - HINT_LEFT; // 217
const HINT_Y = 8;
const HINT_H = 96;

// Main Menu button (left column, below the grid)
const MENU_BTN_W = GRID_LEFT; // 115
const MENU_BTN_H = 50;
const MENU_BTN_X = 0;
const MENU_BTN_Y = KEYBOARD_TOP - MENU_BTN_H - 4;

// Title screen button rects
const START_RECT = { x: 188, y: 480, w: 128, h: 84 };
const QUIT_RECT  = { x: 188, y: 568, w: 128, h: 84 };
const HELP_RECT   = { x: 400, y: 620, w: 80, h: 37 };

// --- Colours (fallback when art is missing) ---

const BG = "#121213";
const WHITE = "#ffffff";
const EMPTY_BORDER = "#3a3a3c";
const FILLED_BORDER = "#565758";

const GREEN_BG = "#538d4e";
const ORANGE_BG = "#c97a38";
const GRAY_BG = "#3a3a3c";
const TEAL_BG = "#0a5a5a";
const PURPLE_BG = "#58388c";

const KEY_BG_COLOUR = "#818384";
const KEY_TEXT = "#ffffff";
const KEY_GREEN = "#538d4e";
const KEY_ORANGE = "#c97a38";
const KEY_GRAY = "#3a3a3c";
const KEY_PURPLE = "#58388c";

const TEXT_DIM = "#787878";
const TEXT_BRIGHT = "#d7d7d7";

const FLASH_COLOUR = "#dc3232";
const FLASH_DURATION = 60;

const BG_DIM = 0.4;
const KEY_ALPHA = 0.6;
const EMPTY_TILE_ALPHA = 0.5;

const CONFETTI_COLOURS = [
    [255, 100, 100], [100, 200, 255], [100, 255, 100],
    [255, 255, 100], [255, 165, 0], [200, 100, 255],
    [255, 150, 200], [100, 255, 255],
];
const FIREWORK_COLOURS = [
    [255, 200, 100], [255, 100, 100], [100, 200, 255],
    [255, 255, 150], [200, 150, 255], [150, 255, 150],
];

// --- Particle class ---

class Particle {
    constructor(x, y, vx, vy, colour, life, gravity = 0.3, size = 6,
                w = null, h = null, angle = 0, spin = 0) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.colour = colour;
        this.life = life; this.maxLife = life;
        this.gravity = gravity;
        this.size = size;
        this.w = w || size; this.h = h || size;
        this.angle = angle; this.spin = spin;
    }

    update() {
        this.x += this.vx; this.y += this.vy;
        this.vy += this.gravity; this.vx *= 0.99;
        this.angle += this.spin; this.life -= 1;
    }

    isAlive() { return this.life > 0; }
}

// --- AmbientParticle class ---

class AmbientParticle {
    constructor(x, y, vx, vy, colour, size, life, ptype,
                swayPhase = 0, swayAmp = 0, maxAlpha = 160) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.colour = colour;
        this.size = size;
        this.life = life; this.maxLife = life;
        this.ptype = ptype;
        this.swayPhase = swayPhase; this.swayAmp = swayAmp;
        this.maxAlpha = maxAlpha;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.swayAmp !== 0) {
            this.x += Math.sin(this.swayPhase) * this.swayAmp;
            this.swayPhase += 0.03;
        }
        this.life -= 1;
    }

    isAlive() { return this.life > 0; }

    alphaRatio() {
        return Math.min(1.0, (this.maxLife - this.life) / 60, this.life / 60);
    }
}

// --- StampEffect class (spring physics) ---

class StampEffect {
    constructor(image, cx, cy, rotation, baseW = 200, maxH = 130, drift = false) {
        this.image = image;
        const [origW, origH] = [image.width, image.height];
        this.baseW = baseW;
        this.baseH = Math.floor(origH * baseW / origW);
        if (maxH !== null && this.baseH > maxH) {
            this.baseH = maxH;
            this.baseW = Math.floor(origW * this.baseH / origH);
        }

        this.cx = cx; this.cy = cy;
        this.rotation = rotation;
        this.frame = 0;

        // Spring state
        this.scale = 0.0;
        this.vel = 0.0;
        this.target = 1.0;
        this.stiffness = 0.22;
        this.damping = 0.28;

        this.scaleX = 0.0;
        this.scaleY = 0.0;
        this.done = false;

        // Drift
        this.drift = drift;
        this.driftFrame = 0;
    }

    update() {
        if (this.done) {
            if (this.drift) this.driftFrame += 1;
            return true;
        }

        this.frame += 1;

        // Spring force
        const force = (this.target - this.scale) * this.stiffness;
        this.vel += force;
        this.vel *= (1.0 - this.damping);
        this.scale += this.vel;

        // Derive X/Y with additive offsets
        if (this.scale < this.target) {
            const amount = (this.target - this.scale) * 0.25;
            this.scaleX = Math.max(0.0, this.scale - amount);
            this.scaleY = this.scale + amount;
        } else if (this.scale > this.target) {
            const amount = (this.scale - this.target) * 0.25;
            this.scaleX = this.scale + amount;
            this.scaleY = this.scale - amount;
        } else {
            this.scaleX = this.target;
            this.scaleY = this.target;
        }

        // Settle check
        if (this.frame > 15
                && Math.abs(this.scale - this.target) < 0.008
                && Math.abs(this.vel) < 0.005) {
            this.scaleX = this.target;
            this.scaleY = this.target;
            this.done = true;
        }

        return this.done;
    }

    draw(ctx, extraScale = 1.0) {
        if (this.scaleX < 0.02 || this.scaleY < 0.02) return;

        const w = Math.max(2, Math.floor(this.baseW * this.scaleX * extraScale));
        const h = Math.max(2, Math.floor(this.baseH * this.scaleY * extraScale));

        let cx = this.cx, cy = this.cy, rot = this.rotation;
        if (this.done && this.drift) {
            cx += 5 * Math.sin(this.driftFrame * 0.006);
            cy += 4 * Math.sin(this.driftFrame * 0.0045);
        }

        ctx.save();
        ctx.translate(cx, cy);
        if (Math.abs(rot) > 0.5) ctx.rotate(rot * Math.PI / 180);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.image, -w / 2, -h / 2, w, h);
        ctx.restore();
    }
}

// --- Display class ---

class Display {
    constructor(assets) {
        this.assets = assets;
        this.canvas = document.getElementById("game-canvas");
        this.ctx = this.canvas.getContext("2d");
        this.ctx.imageSmoothingEnabled = false;

        // Virtual surface (offscreen canvas for rendering at base resolution)
        this.virtual = document.createElement("canvas");
        this.virtual.width = BASE_W;
        this.virtual.height = BASE_H;
        this.vctx = this.virtual.getContext("2d");
        this.vctx.imageSmoothingEnabled = false;

        // Window scaling state
        this.windowW = BASE_W;
        this.windowH = BASE_H;
        this.uiScale = 1;
        this.uiOffsetX = 0;
        this.uiOffsetY = 0;

        // Screen state
        this.state = "title";
        this.revealMode = "solved";
        this.stampEffect = null;
        this.titleStamp = null;
        this.startStamp = null;
        this.quitStamp = null;
        this.highScoreStamp = null;
        this.helpStamp = null;
        this.helpStamps = [];       // stamp animations for help screen sprites
        this.helpEntranceFrame = 0;
        this.titleEntranceFrame = 0;
        this.ambientParticles = [];
        this.hoveredButton = null;
        this.hoverScale = 1.0;
        this.pressedButton = null;
        this.clickButton = null;
        this.clickScale = 1.0;
        this.clickVel = 0.0;
        this.clickPhase = "idle";

        // Keyboard layout
        this.keyboardLayout = [
            [["Q", KEY_W], ["W", KEY_W], ["E", KEY_W], ["R", KEY_W],
             ["T", KEY_W], ["Y", KEY_W], ["U", KEY_W], ["I", KEY_W],
             ["O", KEY_W], ["P", KEY_W]],
            [["A", KEY_W], ["S", KEY_W], ["D", KEY_W], ["F", KEY_W],
             ["G", KEY_W], ["H", KEY_W], ["J", KEY_W], ["K", KEY_W],
             ["L", KEY_W]],
            [["BACK", 125], ["Z", BOTTOM_KEY_W], ["X", BOTTOM_KEY_W],
             ["C", BOTTOM_KEY_W], ["V", BOTTOM_KEY_W], ["B", BOTTOM_KEY_W],
             ["N", BOTTOM_KEY_W], ["M", BOTTOM_KEY_W], ["ENTER", 135]],
        ];

        this.keyColours = {};
        this.message = "";
        this.messageTimer = 0;
        this.flashTimer = 0;
        this.particles = [];
        this.currentBg = null;
        this.bgIndex = 0;

        this.keyRects = [];
        this._computeKeyRects();

        this.hardButtonRect = { x: HARD_BTN_X, y: HARD_BTN_Y, w: HARD_BTN_W, h: HARD_BTN_H };
        this.menuButtonRect = { x: MENU_BTN_X, y: MENU_BTN_Y, w: MENU_BTN_W, h: MENU_BTN_H };

        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDown = false;

        this._setupCanvas();
        this._setupInput();
    }

    _computeKeyRects() {
        this.keyRects = [];
        for (let rowIdx = 0; rowIdx < this.keyboardLayout.length; rowIdx++) {
            const row = this.keyboardLayout[rowIdx];
            const totalW = row.reduce((sum, [_, w]) => sum + w, 0);
            const rowLeft = Math.floor((BASE_W - totalW) / 2);
            let x = rowLeft;
            const y = KEYBOARD_TOP + rowIdx * (KEY_H + KEY_GAP);
            for (const [label, w] of row) {
                this.keyRects.push([label, { x, y, w, h: KEY_H }]);
                x += w;
            }
        }
    }

    _setupCanvas() {
        this._resize();
        window.addEventListener("resize", () => this._resize());
    }

    _resize() {
        const container = document.getElementById("game-container");
        const cw = container.clientWidth;
        const ch = container.clientHeight;

        // Scale to fit the window while maintaining aspect ratio.
        // Uses the smaller of width/height ratio so the whole game fits.
        let scale = Math.min(cw / BASE_W, ch / BASE_H);
        if (scale < 0.1) scale = 0.1;  // prevent zero/tiny scale

        this.uiScale = scale;
        // Canvas needs integer pixel dimensions
        this.windowW = Math.floor(BASE_W * scale);
        this.windowH = Math.floor(BASE_H * scale);
        this.uiOffsetX = Math.floor((cw - this.windowW) / 2);
        this.uiOffsetY = Math.floor((ch - this.windowH) / 2);

        this.canvas.width = this.windowW;
        this.canvas.height = this.windowH;
        this.canvas.style.width = this.windowW + "px";
        this.canvas.style.height = this.windowH + "px";
    }

    _setupInput() {
        this.canvas.addEventListener("mousemove", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });

        this.canvas.addEventListener("mousedown", (e) => {
            if (e.button === 0) {
                this.mouseDown = true;
                this._handleMouseDown();
            }
        });

        this.canvas.addEventListener("mouseup", (e) => {
            if (e.button === 0) {
                this.mouseDown = false;
                this._setClickUp();
            }
        });

        // Touch support
        this.canvas.addEventListener("touchstart", (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = touch.clientX - rect.left;
            this.mouseY = touch.clientY - rect.top;
            this.mouseDown = true;
            this._handleMouseDown();
        }, { passive: false });

        this.canvas.addEventListener("touchend", (e) => {
            e.preventDefault();
            this.mouseDown = false;
            this._setClickUp();
        }, { passive: false });
    }

    _windowToLogical(pos) {
        // pos is already relative to the canvas (from getBoundingClientRect),
        // so just divide by the integer UI scale to get logical coordinates.
        const mx = Math.floor(pos[0] / this.uiScale);
        const my = Math.floor(pos[1] / this.uiScale);
        if (mx < 0 || mx >= BASE_W || my < 0 || my >= BASE_H) return [null, null];
        return [mx, my];
    }

    _pointInRect(x, y, rect) {
        return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
    }

    // --- Background ---

    pickNewBackground() {
        if (!this.assets.bgSurfs.length) {
            this.currentBg = null;
            this.ambientParticles = [];
            return;
        }
        const bgIdx = this.bgIndex % this.assets.bgSurfs.length;
        this.currentBg = this.assets.bgSurfs[bgIdx];
        this.bgIndex += 1;
        this.spawnAmbient(bgIdx);
    }

    _blitCover(surf, target, dim = 0.0) {
        const [sw, sh] = [surf.width, surf.height];
        const [tw, th] = [target.width, target.height];
        let scale = 1;
        while (sw * scale < tw || sh * scale < th) scale += 1;
        const dw = sw * scale;
        const dh = sh * scale;
        const ox = Math.floor((tw - dw) / 2);
        const oy = Math.floor((th - dh) / 2);
        const ctx = target.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(surf, ox, oy, dw, dh);
        if (dim > 0.0) {
            ctx.fillStyle = `rgba(0,0,0,${dim})`;
            ctx.fillRect(0, 0, tw, th);
        }
    }

    // --- Ambient particles ---

    EMBER_COLOURS = [
        [255, 140, 50], [255, 100, 40], [255, 160, 60],
        [220, 80, 30], [255, 120, 30], [240, 90, 30],
    ];
    DUST_COLOURS = [
        [200, 200, 210], [180, 180, 190], [210, 210, 220],
    ];
    SNOW_COLOURS = [
        [240, 240, 250], [230, 235, 245], [250, 250, 255],
    ];

    spawnAmbient(bgIndex) {
        this.ambientParticles = [];
        if (bgIndex === 1) {
            for (let i = 0; i < 25; i++) this.ambientParticles.push(this._makeEmber());
        } else if (bgIndex === 2) {
            for (let i = 0; i < 50; i++) this.ambientParticles.push(this._makeDust());
        } else if (bgIndex === 3) {
            for (let i = 0; i < 35; i++) this.ambientParticles.push(this._makeSnow());
        }
    }

    _makeEmber() {
        return new AmbientParticle(
            Math.random() * BASE_W,
            Math.random() * (BASE_H * 0.5) + BASE_H * 0.5,
            Math.random() * 0.4 - 0.2,
            Math.random() * 0.5 - 0.8,
            this.EMBER_COLOURS[Math.floor(Math.random() * this.EMBER_COLOURS.length)],
            Math.floor(Math.random() * 3) + 3,
            Math.floor(Math.random() * 200) + 300,
            "ember", 0, 0, 150);
    }

    _makeDust() {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 0.2 + 0.1;
        return new AmbientParticle(
            Math.random() * BASE_W,
            Math.random() * BASE_H,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            this.DUST_COLOURS[Math.floor(Math.random() * this.DUST_COLOURS.length)],
            Math.floor(Math.random() * 2) + 1,
            Math.floor(Math.random() * 200) + 400,
            "dust", 0, 0, 100);
    }

    _makeSnow() {
        return new AmbientParticle(
            Math.random() * BASE_W,
            Math.random() * (BASE_H * 0.3) - 30,
            Math.random() * 0.6 - 0.3,
            Math.random() * 1.0 + 0.5,
            this.SNOW_COLOURS[Math.floor(Math.random() * this.SNOW_COLOURS.length)],
            Math.floor(Math.random() * 3) + 2,
            Math.floor(Math.random() * 200) + 400,
            "snow",
            Math.random() * Math.PI * 2,
            Math.random() * 0.5 + 0.3,
            180);
    }

    _respawnAmbient(p) {
        if (p.ptype === "ember") {
            p.x = Math.random() * BASE_W;
            p.y = Math.random() * (BASE_H * 0.3) + BASE_H * 0.7;
            p.vx = Math.random() * 0.4 - 0.2;
            p.vy = Math.random() * 0.5 - 0.8;
            p.life = Math.floor(Math.random() * 200) + 300;
        } else if (p.ptype === "dust") {
            p.x = Math.random() * BASE_W;
            p.y = Math.random() * BASE_H;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.2 + 0.1;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = Math.floor(Math.random() * 200) + 400;
        } else if (p.ptype === "snow") {
            p.x = Math.random() * BASE_W;
            p.y = -30 + Math.random() * 20;
            p.vx = Math.random() * 0.6 - 0.3;
            p.vy = Math.random() * 1.0 + 0.5;
            p.life = Math.floor(Math.random() * 200) + 400;
        }
        p.maxLife = p.life;
    }

    tickAmbient() {
        for (const p of this.ambientParticles) {
            p.update();
            if (p.life <= 0) {
                this._respawnAmbient(p);
                continue;
            }
            if (p.y < -30) { p.y = BASE_H + 30; p.x = Math.random() * BASE_W; }
            else if (p.y > BASE_H + 30) { p.y = -30; p.x = Math.random() * BASE_W; }
            if (p.x < -30) p.x = BASE_W + 30;
            else if (p.x > BASE_W + 30) p.x = -30;
        }
    }

    _drawAmbient() {
        const ctx = this.vctx;
        for (const p of this.ambientParticles) {
            if (p.life <= 0) continue;
            const ratio = p.alphaRatio();
            const alpha = Math.floor(p.maxAlpha * ratio);
            if (alpha <= 0) continue;
            const [r, g, b] = p.colour;
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha / 255})`;
            ctx.beginPath();
            ctx.arc(Math.floor(p.x), Math.floor(p.y), p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- Drawing ---

    draw(game, inputBuffer = "") {
        if (this.state === "title") {
            this._drawTitleScreen(game);
        } else if (this.state === "help") {
            this._drawHelpScreen(game);
        } else if (this.state === "reveal") {
            this._drawReveal(game);
        } else {
            this._drawGameplay(game, inputBuffer);
        }
        this._present();
    }

    _present() {
        const ctx = this.ctx;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // Draw the virtual surface scaled to fill the entire canvas.
        // The canvas is already sized to windowW x windowH (BASE * scale),
        // and the flexbox container centres the canvas — so draw at (0, 0).
        ctx.drawImage(this.virtual, 0, 0, this.canvas.width, this.canvas.height);
    }

    // --- Title screen ---

    TITLE_TRIGGER = 0;
    START_TRIGGER = 15;
    QUIT_TRIGGER = 30;
    HIGH_SCORE_TRIGGER = 45;
    HELP_TRIGGER = 60;

    _drawTitleScreen(game) {
        const ctx = this.vctx;
        ctx.imageSmoothingEnabled = false;

        // Background
        const titleBg = this.assets.getTitleBackground();
        if (titleBg) {
            this._blitCover(titleBg, this.virtual, BG_DIM);
        } else {
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, BASE_W, BASE_H);
        }

        // Title logo
        const title = this.assets.getTitle();
        if (this.titleStamp) {
            this.titleStamp.draw(ctx);
        } else if (title) {
            const tw = title.width, th = title.height;
            const scale = 2;
            ctx.drawImage(title,
                Math.floor((BASE_W - tw * scale) / 2),
                Math.floor(130 - th * scale / 2),
                tw * scale, th * scale);
        } else {
            ctx.fillStyle = TEXT_BRIGHT;
            ctx.font = "bold 36px Arial";
            ctx.textAlign = "center";
            ctx.fillText("VANDAL RUNES", BASE_W / 2, 130);
        }

        // High score
        if (this.highScoreStamp) {
            this.highScoreStamp.draw(ctx);
        } else if (this.titleEntranceFrame >= this.HIGH_SCORE_TRIGGER) {
            this._drawTitleHighScore(game);
        }

        // Start button
        const startBtn = this.assets.getButton("Says_Start");
        if (this.startStamp) {
            this.startStamp.draw(ctx, this._hoverExtra("start"));
        } else if (this.titleEntranceFrame >= this.START_TRIGGER) {
            const hs = this._hoverExtra("start");
            if (startBtn) {
                this._drawScaled(ctx, startBtn, START_RECT, hs);
            } else {
                this._drawFallbackButton(ctx, START_RECT, GREEN_BG, "START", hs);
            }
        }

        // Quit button
        const quitBtn = this.assets.getButton("Says_Quit");
        if (this.quitStamp) {
            this.quitStamp.draw(ctx, this._hoverExtra("quit"));
        } else if (this.titleEntranceFrame >= this.QUIT_TRIGGER) {
            const hs = this._hoverExtra("quit");
            if (quitBtn) {
                this._drawScaled(ctx, quitBtn, QUIT_RECT, hs);
            } else {
                this._drawFallbackButton(ctx, QUIT_RECT, "#782828", "QUIT", hs);
            }
        }

        // Help button
        const helpBtn = this.assets.getButton("Help");
        if (this.helpStamp) {
            this.helpStamp.draw(ctx, this._hoverExtra("help"));
        } else if (this.titleEntranceFrame >= this.HELP_TRIGGER) {
            const hs = this._hoverExtra("help");
            if (helpBtn) {
                this._drawScaled(ctx, helpBtn, HELP_RECT, hs);
            } else {
                this._drawFallbackButton(ctx, HELP_RECT, "#3c3c3c", "HELP", hs);
            }
        }
    }

    // --- Help screen ---

    // Help sprite order (top to bottom)
    HELP_SPRITE_ORDER = [
        "Guess_the_hidden_5-letter_word",
        "Green_right_letter_right_s",
        "Orange_right_letter_wrong",
        "Gray_letter_not_in_the_word",
        "Solve_words_in_a_row_to_build",
        "Hard_mode_Reuse_revealed_lette",
        "Last_guess_Easy_mode_shows_a",
    ];

    _generateHelpLayout() {
        // Generate random placement for each help sprite and create
        // StampEffect instances for the stamping entrance animation.
        // Each sprite is scaled to fit within the screen, placed with its
        // centre within ±10px of the screen centre line (x=252), and
        // rotated randomly ±5 degrees.  Sprites are stacked vertically
        // with spacing calculated to fill the screen evenly.
        const maxWidth = BASE_W - 30;  // 474px usable width
        const topMargin = 15;
        const bottomMargin = 95;  // leave room for "Main Menu" button

        // First pass: calculate scaled sizes
        const items = [];
        let totalHeight = 0;
        for (const name of this.HELP_SPRITE_ORDER) {
            const spr = this.assets.getHelpSprite(name);
            if (!spr) continue;
            // Scale to fit within maxWidth, preserving aspect ratio
            const scale = Math.min(maxWidth / spr.width, 1.0);
            const w = Math.floor(spr.width * scale);
            const h = Math.floor(spr.height * scale);
            // Random x offset: centre within ±10px of screen centre
            const xOffset = (Math.random() * 20) - 10;
            // Random rotation: ±5 degrees
            const rotation = (Math.random() * 10) - 5;
            items.push({ name, w, h, xOffset, rotation });
            totalHeight += h;
        }

        // Calculate spacing to distribute evenly
        const spacing = items.length > 1
            ? (BASE_H - topMargin - bottomMargin - totalHeight) / (items.length - 1)
            : 0;

        // Assign y positions and create stamps
        this.helpStamps = [];
        let y = topMargin;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            item.y = y;
            y += item.h + Math.max(spacing, 4);

            const spr = this.assets.getHelpSprite(item.name);
            const cx = Math.floor(BASE_W / 2 + item.xOffset);
            const cy = Math.floor(item.y + item.h / 2);
            // Stamp with the sprite's base size = scaled w/h, rotation
            this.helpStamps.push(new StampEffect(
                spr, cx, cy, item.rotation, item.w, null));
        }

        this.helpEntranceFrame = 0;
        this._helpLayout = items;
    }

    // Stagger: each help sprite stamps 10 frames after the previous
    HELP_STAMP_STAGGER = 10;

    tickHelpEntrance() {
        this.helpEntranceFrame += 1;
        const f = this.helpEntranceFrame;

        // Spawn stamps at staggered intervals (already created in
        // _generateHelpLayout, but we activate them by ticking from
        // their trigger frame onward).
        for (let i = 0; i < this.helpStamps.length; i++) {
            const trigger = i * this.HELP_STAMP_STAGGER;
            if (f > trigger) {
                this.helpStamps[i].update();
            }
        }
    }

    _drawHelpScreen(game) {
        const ctx = this.vctx;
        ctx.imageSmoothingEnabled = false;

        // Background — use BG1 (first gameplay background)
        const bg = this.assets.bgSurfs[0] || null;
        if (bg) {
            this._blitCover(bg, this.virtual, BG_DIM);
        } else {
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, BASE_W, BASE_H);
        }

        // Generate layout + stamps if not yet generated
        if (!this._helpLayout) {
            this._generateHelpLayout();
        }

        // Draw each help sprite through its stamp animation
        for (let i = 0; i < this.helpStamps.length; i++) {
            const stamp = this.helpStamps[i];
            const trigger = i * this.HELP_STAMP_STAGGER;
            if (this.helpEntranceFrame > trigger) {
                stamp.draw(ctx);
            }
        }

        // "Main Menu" button at the bottom (scaled down)
        const menuBtn = this.assets.getButton("Main_Menu");
        if (menuBtn) {
            const btnW = 80;
            const scale = btnW / menuBtn.width;
            const w = Math.floor(menuBtn.width * scale);
            const h = Math.floor(menuBtn.height * scale);
            ctx.drawImage(menuBtn,
                Math.floor((BASE_W - w) / 2),
                BASE_H - h - 15,
                w, h);
        } else {
            ctx.fillStyle = TEXT_DIM;
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Main Menu", Math.floor(BASE_W / 2), BASE_H - 30);
        }
    }

    _drawScaled(ctx, img, rect, scale) {
        // Scale image to fit inside rect, then apply extra scale (hover/click).
        const fitScale = Math.min(
            (rect.w - 4) / img.width,
            (rect.h - 4) / img.height
        );
        const s = fitScale * scale;
        const w = Math.floor(img.width * s);
        const h = Math.floor(img.height * s);
        ctx.drawImage(img,
            Math.floor(rect.x + rect.w / 2 - w / 2),
            Math.floor(rect.y + rect.h / 2 - h / 2),
            w, h);
    }

    _drawFallbackButton(ctx, rect, colour, text, scale = 1.0) {
        const w = Math.floor(rect.w * scale);
        const h = Math.floor(rect.h * scale);
        const x = Math.floor(rect.x + rect.w / 2 - w / 2);
        const y = Math.floor(rect.y + rect.h / 2 - h / 2);
        ctx.fillStyle = colour;
        this._roundRect(ctx, x, y, w, h, 6);
        ctx.fill();
        ctx.fillStyle = WHITE;
        ctx.font = "bold 22px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, Math.floor(rect.x + rect.w / 2), Math.floor(rect.y + rect.h / 2));
    }

    _drawTitleHighScore(game) {
        const ctx = this.vctx;
        const best = game.getHighScore();
        const labelH = 40, numH = 28, gap = 4;

        // Label sprite
        const label = this.assets.getButton("HIGH_SCORE_sprite");
        let labelW, labelH2;
        if (label) {
            const lw = label.width, lh = label.height;
            const scale = labelH / lh;
            labelW = Math.max(1, Math.floor(lw * scale));
            labelH2 = Math.max(1, Math.floor(lh * scale));
        } else {
            ctx.font = "bold 18px Arial";
            const m = ctx.measureText("HIGH SCORE");
            labelW = m.width;
            labelH2 = 18;
        }

        // Number digits
        const digits = this._hsDigitsToSurfs(best);
        let totalNumW = 0;
        let digitSurfs = [];
        if (digits.length > 0) {
            for (const d of digits) {
                const scale = numH / d.height;
                const dw = Math.max(1, Math.floor(d.width * scale));
                totalNumW += dw + 3;
            }
            totalNumW -= 3;
        } else {
            ctx.font = "bold 18px Arial";
            totalNumW = ctx.measureText(String(best)).width;
        }

        // Draw label
        const labelY = 300;
        const labelX = Math.floor((BASE_W - labelW) / 2);
        if (label) {
            ctx.drawImage(label, labelX, labelY, labelW, labelH2);
        } else {
            ctx.fillStyle = TEXT_BRIGHT;
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillText("HIGH SCORE", Math.floor(BASE_W / 2), labelY + labelH2);
        }

        // Draw number
        const numY = labelY + labelH2 + gap;
        if (digits.length > 0) {
            let nx = Math.floor((BASE_W - totalNumW) / 2);
            for (const d of digits) {
                const scale = numH / d.height;
                const dw = Math.max(1, Math.floor(d.width * scale));
                ctx.drawImage(d, nx, numY, dw, numH);
                nx += dw + 3;
            }
        } else {
            ctx.fillStyle = TEXT_BRIGHT;
            ctx.textAlign = "center";
            ctx.fillText(String(best), Math.floor(BASE_W / 2), numY + numH);
        }
    }

    // --- Gameplay screen ---

    _drawGameplay(game, inputBuffer = "") {
        const ctx = this.vctx;
        ctx.imageSmoothingEnabled = false;

        // Background
        if (this.currentBg) {
            this._blitCover(this.currentBg, this.virtual, BG_DIM);
        } else {
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, BASE_W, BASE_H);
        }

        // Ambient particles
        this._drawAmbient();

        this._drawScore(game);
        this._drawHardButton(game);
        this._drawMenuButton(game);
        this._drawHint(game);
        this._drawGrid(game, inputBuffer);
        this._drawKeyboard(game);
        this._drawParticles();
        this._drawMessage();
    }

    _drawScore(game) {
        const streak = game.getStreak();
        const best = game.getHighScore();
        const areaX = 0, areaW = GRID_LEFT, areaH = GRID_TOP;
        const rowH = Math.floor(areaH / 2);

        this._drawScoreStacked("HIGH_SCORE_sprite", best, areaX, 0, areaW, rowH, true);
        this._drawScoreStacked("CURRENT_Sprite", streak, areaX, rowH, areaW, rowH, false);
    }

    _drawScoreStacked(spriteName, value, x, y, w, h, useHsDigits) {
        const ctx = this.vctx;
        const titleH = Math.floor(h * 0.58);
        const numH = Math.floor(h * 0.38);
        const numY = y + titleH + 2;

        // Title sprite
        const label = this.assets.getButton(spriteName);
        if (label) {
            const lw = label.width, lh = label.height;
            const scale = Math.min(w / lw, titleH / lh);
            const sw = Math.max(1, Math.floor(lw * scale));
            const sh = Math.max(1, Math.floor(lh * scale));
            ctx.drawImage(label, Math.floor(x + (w - sw) / 2), y, sw, sh);
        } else {
            ctx.fillStyle = TEXT_BRIGHT;
            ctx.font = "bold 18px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            const text = spriteName.replace("_Sprite", "").replace("_sprite", "").replace(/_/g, " ");
            ctx.fillText(text, Math.floor(x + w / 2), Math.floor(y + titleH / 2));
        }

        // Number
        const digits = useHsDigits ? this._hsDigitsToSurfs(value) : this._digitsToSurfs(value);
        if (digits.length > 0) {
            let totalW = 0;
            const scaled = digits.map(d => {
                const scale = numH / d.height;
                const dw = Math.max(1, Math.floor(d.width * scale));
                totalW += dw + 2;
                return [d, dw];
            });
            totalW -= 2;
            let dx = Math.floor(x + (w - totalW) / 2);
            for (const [d, dw] of scaled) {
                ctx.drawImage(d, dx, numY, dw, numH);
                dx += dw + 2;
            }
        } else {
            ctx.fillStyle = TEXT_BRIGHT;
            ctx.font = "bold 18px Arial";
            ctx.textAlign = "center";
            ctx.fillText(String(value), Math.floor(x + w / 2), Math.floor(numY + numH / 2));
        }
    }

    _digitsToSurfs(value) {
        if (!this.assets.hasDigits()) return [];
        const result = [];
        for (const ch of String(value)) {
            const d = this.assets.getDigit(parseInt(ch));
            if (d) result.push(d);
            else return [];
        }
        return result;
    }

    _hsDigitsToSurfs(value) {
        if (!this.assets.hasHsDigits()) return this._digitsToSurfs(value);
        const result = [];
        for (const ch of String(value)) {
            const d = this.assets.getHsDigit(parseInt(ch));
            if (d) result.push(d);
            else return this._digitsToSurfs(value);
        }
        return result;
    }

    _drawHardButton(game) {
        const ctx = this.vctx;
        const hardOn = game.isHardMode();
        const btn = this.assets.getButton("Says_Hard");
        const hs = this._hoverExtra("hard");
        if (btn) {
            const [scaled, rect] = this._scaleToFit(btn, this.hardButtonRect);
            if (scaled) {
                let img = scaled;
                let r = rect;
                if (hs !== 1.0) {
                    const sw = Math.floor(rect.w * hs);
                    const sh = Math.floor(rect.h * hs);
                    r = { x: Math.floor(this.hardButtonRect.x + this.hardButtonRect.w / 2 - sw / 2),
                          y: Math.floor(this.hardButtonRect.y + this.hardButtonRect.h / 2 - sh / 2),
                          w: sw, h: sh };
                }
                if (hardOn) {
                    ctx.drawImage(img, r.x, r.y, r.w, r.h);
                } else {
                    ctx.globalAlpha = 0.31;
                    ctx.drawImage(img, r.x, r.y, r.w, r.h);
                    ctx.globalAlpha = 1.0;
                }
            }
        } else {
            const colour = hardOn ? GREEN_BG : "#3c3c3c";
            ctx.fillStyle = colour;
            this._roundRect(ctx, this.hardButtonRect.x, this.hardButtonRect.y,
                           this.hardButtonRect.w, this.hardButtonRect.h, 4);
            ctx.fill();
            ctx.strokeStyle = WHITE;
            ctx.lineWidth = 1;
            this._roundRect(ctx, this.hardButtonRect.x, this.hardButtonRect.y,
                           this.hardButtonRect.w, this.hardButtonRect.h, 4);
            ctx.stroke();
            ctx.fillStyle = WHITE;
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(hardOn ? "Hard: ON" : "Hard: OFF",
                        Math.floor(this.hardButtonRect.x + this.hardButtonRect.w / 2),
                        Math.floor(this.hardButtonRect.y + this.hardButtonRect.h / 2));
        }
    }

    _drawMenuButton(game) {
        const ctx = this.vctx;
        const btn = this.assets.getButton("Main_Menu");
        const hs = this._hoverExtra("menu");
        if (btn) {
            const [scaled, rect] = this._scaleToFit(btn, this.menuButtonRect);
            if (scaled) {
                if (hs === 1.0) {
                    ctx.drawImage(scaled, rect.x, rect.y, rect.w, rect.h);
                } else {
                    const sw = Math.floor(rect.w * hs);
                    const sh = Math.floor(rect.h * hs);
                    ctx.drawImage(scaled,
                        Math.floor(this.menuButtonRect.x + this.menuButtonRect.w / 2 - sw / 2),
                        Math.floor(this.menuButtonRect.y + this.menuButtonRect.h / 2 - sh / 2),
                        sw, sh);
                }
            }
        } else {
            ctx.fillStyle = "#3c3c3c";
            this._roundRect(ctx, this.menuButtonRect.x, this.menuButtonRect.y,
                           this.menuButtonRect.w, this.menuButtonRect.h, 4);
            ctx.fill();
            ctx.strokeStyle = WHITE;
            ctx.lineWidth = 1;
            this._roundRect(ctx, this.menuButtonRect.x, this.menuButtonRect.y,
                           this.menuButtonRect.w, this.menuButtonRect.h, 4);
            ctx.stroke();
            ctx.fillStyle = WHITE;
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("MENU",
                        Math.floor(this.menuButtonRect.x + this.menuButtonRect.w / 2),
                        Math.floor(this.menuButtonRect.y + this.menuButtonRect.h / 2));
        }
    }

    _drawHint(game) {
        const guessCount = game.getGuessCount();
        if (guessCount !== MAX_GUESSES - 1) return;
        const definition = game.getDefinition();
        if (!definition) return;

        const ctx = this.vctx;
        const hintSurf = this._renderTextColoured(definition, HINT_W, "red", 18, 6, 4);
        if (!hintSurf) return;

        if (game.isHardMode()) ctx.globalAlpha = 0;
        else ctx.globalAlpha = 1;

        ctx.drawImage(hintSurf,
            Math.floor(HINT_LEFT + HINT_W / 2 - hintSurf.width / 2),
            Math.floor(HINT_Y + HINT_H / 2 - hintSurf.height / 2));
        ctx.globalAlpha = 1;
    }

    _drawGrid(game, inputBuffer = "") {
        const ctx = this.vctx;
        const history = game.getGuessHistory();
        const guessCount = game.getGuessCount();
        const flashing = this._isFlashing();

        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 5; col++) {
                const x = GRID_LEFT + col * (TILE_SIZE + TILE_GAP);
                const y = GRID_TOP + row * (TILE_SIZE + TILE_GAP);

                if (row < guessCount) {
                    const { word, colours } = history[row];
                    const letter = word[col];
                    const spriteColour = GAME_COLOUR_TO_SPRITE[colours[col]] || "purple";
                    this._drawTileSprite(x, y, letter, spriteColour, true);
                } else if (row === guessCount) {
                    if (col < inputBuffer.length) {
                        const letter = inputBuffer[col];
                        const border = flashing ? FLASH_COLOUR : FILLED_BORDER;
                        this._drawTileSprite(x, y, letter, "teal", false, border);
                    } else {
                        const border = flashing ? FLASH_COLOUR : EMPTY_BORDER;
                        this._drawTile(x, y, "", BG, border, false);
                    }
                } else {
                    this._drawTile(x, y, "", EMPTY_BORDER, EMPTY_BORDER, false, EMPTY_TILE_ALPHA);
                }
            }
        }
    }

    _drawTileSprite(x, y, letter, spriteColour, filled = false, border = null) {
        const ctx = this.vctx;
        const bg = filled ? this._spriteColourBg(spriteColour) : BG;
        const rect = { x, y, w: TILE_SIZE, h: TILE_SIZE };
        ctx.fillStyle = bg;
        this._roundRect(ctx, x, y, TILE_SIZE, TILE_SIZE, 4);
        ctx.fill();
        if (!filled) {
            ctx.strokeStyle = border || EMPTY_BORDER;
            ctx.lineWidth = 2;
            this._roundRect(ctx, x, y, TILE_SIZE, TILE_SIZE, 4);
            ctx.stroke();
        }
        if (letter) {
            const lsurf = this.assets.getLetter(spriteColour, letter);
            if (lsurf) {
                ctx.drawImage(lsurf,
                    Math.floor(x + TILE_SIZE / 2 - lsurf.width / 2),
                    Math.floor(y + TILE_SIZE / 2 - lsurf.height / 2));
            } else {
                ctx.fillStyle = WHITE;
                ctx.font = "bold 28px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(letter, Math.floor(x + TILE_SIZE / 2), Math.floor(y + TILE_SIZE / 2));
            }
        }
    }

    _drawTile(x, y, letter, bg, border, filled = false, alpha = 1.0) {
        const ctx = this.vctx;
        if (alpha < 1.0) {
            ctx.globalAlpha = alpha;
        }
        ctx.fillStyle = bg;
        this._roundRect(ctx, x, y, TILE_SIZE, TILE_SIZE, 4);
        ctx.fill();
        if (!filled) {
            ctx.strokeStyle = border;
            ctx.lineWidth = 2;
            this._roundRect(ctx, x, y, TILE_SIZE, TILE_SIZE, 4);
            ctx.stroke();
        }
        if (letter) {
            ctx.fillStyle = WHITE;
            ctx.font = "bold 28px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(letter, Math.floor(x + TILE_SIZE / 2), Math.floor(y + TILE_SIZE / 2));
        }
        ctx.globalAlpha = 1.0;
    }

    _scaleToFit(surf, targetRect, padding = 2) {
        if (!surf) return [null, null];
        const [sw, sh] = [surf.width, surf.height];
        const tw = targetRect.w - padding * 2;
        const th = targetRect.h - padding * 2;
        const scale = Math.min(tw / sw, th / sh);
        if (scale >= 1) {
            return [surf, { x: Math.floor(targetRect.x + targetRect.w / 2 - sw / 2),
                           y: Math.floor(targetRect.y + targetRect.h / 2 - sh / 2),
                           w: sw, h: sh }];
        }
        const nw = Math.floor(sw * scale);
        const nh = Math.floor(sh * scale);
        return [surf, { x: Math.floor(targetRect.x + targetRect.w / 2 - nw / 2),
                        y: Math.floor(targetRect.y + targetRect.h / 2 - nh / 2),
                        w: nw, h: nh }];
    }

    _spriteColourBg(name) {
        switch (name) {
            case "green": return GREEN_BG;
            case "orange": return ORANGE_BG;
            case "gray": return GRAY_BG;
            case "teal": return TEAL_BG;
            case "purple": return PURPLE_BG;
            default: return BG;
        }
    }

    _drawKeyboard(game) {
        const ctx = this.vctx;
        const hardMode = game && game.isHardMode();
        for (const [label, rect] of this.keyRects) {
            const colourName = this.keyColours[label];
            let spriteColour;
            if (colourName === undefined) {
                spriteColour = hardMode ? "purple" : "teal";
            } else {
                spriteColour = GAME_COLOUR_TO_SPRITE[colourName] || "teal";
            }

            const hs = this._hoverExtra(label);

            if (label === "BACK") {
                const btn = this.assets.getButton("Says_Back");
                if (btn) {
                    const [scaled, srect] = this._scaleToFit(btn, rect);
                    if (scaled) {
                        if (hs !== 1.0) {
                            const sw = Math.floor(srect.w * hs);
                            const sh = Math.floor(srect.h * hs);
                            ctx.drawImage(scaled,
                                Math.floor(rect.x + rect.w / 2 - sw / 2),
                                Math.floor(rect.y + rect.h / 2 - sh / 2), sw, sh);
                        } else {
                            ctx.drawImage(scaled, srect.x, srect.y, srect.w, srect.h);
                        }
                    }
                } else {
                    this._drawKeyFallback(ctx, rect, "BACK", hs);
                }
            } else if (label === "ENTER") {
                const btn = this.assets.getButton("Says_enter");
                if (btn) {
                    const [scaled, srect] = this._scaleToFit(btn, rect);
                    if (scaled) {
                        if (hs !== 1.0) {
                            const sw = Math.floor(srect.w * hs);
                            const sh = Math.floor(srect.h * hs);
                            ctx.drawImage(scaled,
                                Math.floor(rect.x + rect.w / 2 - sw / 2),
                                Math.floor(rect.y + rect.h / 2 - sh / 2), sw, sh);
                        } else {
                            ctx.drawImage(scaled, srect.x, srect.y, srect.w, srect.h);
                        }
                    }
                } else {
                    this._drawKeyFallback(ctx, rect, "ENTER", hs);
                }
            } else {
                // Letter key
                const bg = this._keyBg(colourName);
                if (bg) {
                    ctx.fillStyle = `rgba(${this._hexToRgb(bg)},${KEY_ALPHA})`;
                    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 4);
                    ctx.fill();
                }
                const lsurf = this.assets.getLetter(spriteColour, label);
                if (lsurf) {
                    if (hs !== 1.0) {
                        const lw = Math.floor(lsurf.width * hs);
                        const lh = Math.floor(lsurf.height * hs);
                        ctx.drawImage(lsurf,
                            Math.floor(rect.x + rect.w / 2 - lw / 2),
                            Math.floor(rect.y + rect.h / 2 - lh / 2), lw, lh);
                    } else {
                        ctx.drawImage(lsurf,
                            Math.floor(rect.x + rect.w / 2 - lsurf.width / 2),
                            Math.floor(rect.y + rect.h / 2 - lsurf.height / 2));
                    }
                } else {
                    ctx.fillStyle = KEY_TEXT;
                    ctx.font = "bold 18px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(label, Math.floor(rect.x + rect.w / 2), Math.floor(rect.y + rect.h / 2));
                }
            }
        }
    }

    _drawKeyFallback(ctx, rect, text, hs) {
        ctx.fillStyle = KEY_BG_COLOUR;
        this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 4);
        ctx.fill();
        ctx.fillStyle = KEY_TEXT;
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, Math.floor(rect.x + rect.w / 2), Math.floor(rect.y + rect.h / 2));
    }

    _keyBg(colourName) {
        if (colourName === "green") return KEY_GREEN;
        if (colourName === "yellow") return KEY_ORANGE;
        if (colourName === "gray") return null;
        return null;
    }

    _hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    }

    _drawMessage() {
        if (this.message && this.messageTimer > 0) {
            const ctx = this.vctx;
            ctx.font = "14px Arial";
            const m = ctx.measureText(this.message);
            const w = m.width;
            const cx = Math.floor(BASE_W / 2);
            const cy = BASE_H - 25;
            ctx.fillStyle = "#282828";
            this._roundRect(ctx, cx - Math.floor(w / 2) - 10, cy - 10, w + 20, 20, 4);
            ctx.fill();
            ctx.fillStyle = TEXT_BRIGHT;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(this.message, cx, cy);
        }
    }

    // --- Reveal overlay ---

    RED_FONT_FALLBACK = [200, 40, 40];
    PURPLE_FONT_FALLBACK = [140, 80, 200];

    REVEAL_MODES = {
        "solved": { sprite: "red",    fallback: [200, 40, 40] },
        "failed": { sprite: "purple", fallback: [140, 80, 200] },
    };

    _renderTextColoured(text, maxWidth, colour = "red", letterH = 28, spaceW = 12, lineGap = 10) {
        const mode = this.REVEAL_MODES[colour] || this.REVEAL_MODES["solved"];
        const spriteName = mode.sprite;
        const fallbackColour = mode.fallback;

        text = text.toUpperCase();
        const words = text.split(" ").filter(w => w.length > 0);
        if (words.length === 0) return null;

        // Render each word as a strip of glyph canvases
        const wordSurfs = [];
        for (const word of words) {
            const glyphs = [];
            for (const ch of word) {
                if (/[A-Z]/.test(ch)) {
                    const lsurf = this.assets.getLetter(spriteName, ch);
                    if (lsurf) {
                        const scale = letterH / lsurf.height;
                        const sw = Math.max(1, Math.floor(lsurf.width * scale));
                        const tmp = document.createElement("canvas");
                        tmp.width = sw; tmp.height = letterH;
                        const tctx = tmp.getContext("2d");
                        tctx.imageSmoothingEnabled = true;
                        tctx.drawImage(lsurf, 0, 0, sw, letterH);
                        glyphs.push(tmp);
                        continue;
                    }
                }
                // Fallback
                const tmp = document.createElement("canvas");
                const tctx = tmp.getContext("2d");
                tctx.font = `bold ${letterH}px Arial`;
                const m = tctx.measureText(ch);
                tmp.width = Math.max(1, Math.ceil(m.width));
                tmp.height = letterH;
                tctx.font = `bold ${letterH}px Arial`;
                tctx.fillStyle = `rgb(${fallbackColour.join(",")})`;
                tctx.textBaseline = "top";
                tctx.fillText(ch, 0, 0);
                glyphs.push(tmp);
            }
            if (glyphs.length > 0) {
                const wordW = glyphs.reduce((s, g) => s + g.width, 0);
                const ws = document.createElement("canvas");
                ws.width = wordW; ws.height = letterH;
                const wctx = ws.getContext("2d");
                let gx = 0;
                for (const g of glyphs) {
                    wctx.drawImage(g, gx, 0);
                    gx += g.width;
                }
                wordSurfs.push(ws);
            }
        }

        if (wordSurfs.length === 0) return null;

        // Word-wrap into lines
        const lines = [];
        let currentLine = [];
        let currentW = 0;
        for (const ws of wordSurfs) {
            const ww = ws.width;
            if (currentLine.length > 0 && currentW + spaceW + ww > maxWidth) {
                lines.push(currentLine);
                currentLine = [ws];
                currentW = ww;
            } else {
                if (currentLine.length > 0) currentW += spaceW;
                currentLine.push(ws);
                currentW += ww;
            }
        }
        if (currentLine.length > 0) lines.push(currentLine);

        // Compose
        const lineH2 = letterH + lineGap;
        const totalH = lines.length * lineH2 - lineGap;
        let maxLineW = 0;
        for (const line of lines) {
            const lw = line.reduce((s, ws) => s + ws.width, 0) + spaceW * (line.length - 1);
            if (lw > maxLineW) maxLineW = lw;
        }

        const result = document.createElement("canvas");
        result.width = maxLineW; result.height = totalH;
        const rctx = result.getContext("2d");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lw = line.reduce((s, ws) => s + ws.width, 0) + spaceW * (line.length - 1);
            let x = Math.floor((maxLineW - lw) / 2);
            const y = i * lineH2;
            for (const ws of line) {
                rctx.drawImage(ws, x, y);
                x += ws.width + spaceW;
            }
        }
        return result;
    }

    _drawReveal(game) {
        const ctx = this.vctx;
        const mode = this.revealMode;
        const isFailed = mode === "failed";
        const colour = isFailed ? "purple" : "red";

        // Draw gameplay underneath
        this._drawGameplay(game, "");

        // Opaque overlay
        ctx.fillStyle = isFailed ? "rgba(140,20,20,0.94)" : "rgba(0,0,0,0.94)";
        ctx.fillRect(0, 0, BASE_W, BASE_H);

        // Remaining confetti on solve
        if (!isFailed) this._drawParticles();

        // Answer word
        const answer = game.getAnswer();
        const wordSurf = this._renderTextColoured(answer, BASE_W - 40, colour, 48);
        if (wordSurf) {
            ctx.drawImage(wordSurf,
                Math.floor(BASE_W / 2 - wordSurf.width / 2),
                Math.floor(BASE_H / 2 - 70 - wordSurf.height / 2));
        }

        // Definition
        const definition = game.getDefinition();
        if (definition) {
            const defSurf = this._renderTextColoured(definition, BASE_W - 60, colour, 26);
            if (defSurf) {
                ctx.drawImage(defSurf,
                    Math.floor(BASE_W / 2 - defSurf.width / 2),
                    Math.floor(BASE_H / 2 + 30 - defSurf.height / 2));
            }
        }

        // Click to continue
        const clickBtn = this.assets.getButton("CLICK_TO_CONTINUE");
        if (clickBtn) {
            const [scaled, rect] = this._scaleToFit(clickBtn,
                { x: 0, y: BASE_H - 100, w: BASE_W, h: 80 });
            if (scaled) ctx.drawImage(scaled, rect.x, rect.y, rect.w, rect.h);
        } else {
            ctx.fillStyle = TEXT_DIM;
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Click to continue", Math.floor(BASE_W / 2), BASE_H - 40);
        }

        // No-point stamp
        if (this.stampEffect) {
            this.stampEffect.draw(ctx);
        }
    }

    // --- Message and flash ---

    setMessage(text, duration = 120) {
        this.message = text;
        this.messageTimer = duration;
    }

    tickMessage() {
        if (this.messageTimer > 0) this.messageTimer -= 1;
    }

    setFlash(duration = FLASH_DURATION) {
        this.flashTimer = duration;
    }

    tickFlash() {
        if (this.flashTimer > 0) this.flashTimer -= 1;
    }

    _isFlashing() {
        if (this.flashTimer <= 0) return false;
        const elapsed = FLASH_DURATION - this.flashTimer;
        return elapsed % 30 < 15;
    }

    // --- Particles ---

    spawnConfetti() {
        for (let i = 0; i < 60; i++) {
            this.particles.push(new Particle(
                Math.random() * BASE_W,
                Math.random() * 35 - 40,
                Math.random() * 3 - 1.5,
                Math.random() * 2 + 1,
                CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)],
                Math.floor(Math.random() * 80) + 120,
                0.04,
                Math.max(Math.floor(Math.random() * 4) + 5, Math.floor(Math.random() * 2) + 2),
                Math.floor(Math.random() * 4) + 5,
                Math.floor(Math.random() * 2) + 2,
                Math.random() * 360,
                Math.random() * 16 - 8));
        }
    }

    spawnFireworks() {
        for (let i = 0; i < 4; i++) {
            const cx = Math.floor(Math.random() * (BASE_W - 160) + 80);
            const cy = Math.floor(Math.random() * 220 + 80);
            const colour = FIREWORK_COLOURS[Math.floor(Math.random() * FIREWORK_COLOURS.length)];
            for (let j = 0; j < 35; j++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 7 + 3;
                this.particles.push(new Particle(
                    cx, cy,
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed,
                    colour,
                    Math.floor(Math.random() * 40) + 50,
                    0.06,
                    Math.floor(Math.random() * 3) + 3));
            }
        }
    }

    tickParticles() {
        for (const p of this.particles) p.update();
        this.particles = this.particles.filter(p => p.isAlive());
    }

    _drawParticles() {
        const ctx = this.vctx;
        for (const p of this.particles) {
            if (!p.isAlive()) continue;
            const ratio = p.life / p.maxLife;
            const c = p.colour.map(ch => Math.floor(ch * ratio));
            ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
            if (p.w !== p.h) {
                ctx.save();
                ctx.translate(Math.floor(p.x), Math.floor(p.y));
                ctx.rotate(p.angle * Math.PI / 180);
                ctx.fillRect(-Math.floor(p.w / 2) - 2, -Math.floor(p.h / 2) - 2, p.w, p.h);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(Math.floor(p.x), Math.floor(p.y), p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // --- Keyboard colours ---

    updateKeyColours(game) {
        for (const { word, colours } of game.getGuessHistory()) {
            for (let i = 0; i < word.length; i++) {
                const letter = word[i];
                const colourName = colours[i];
                const current = this.keyColours[letter];
                if (current === "green") continue;
                if (colourName === "green") {
                    this.keyColours[letter] = "green";
                } else if (colourName === "yellow" && current !== "green") {
                    this.keyColours[letter] = "yellow";
                } else if (colourName === "gray" && current === undefined) {
                    this.keyColours[letter] = "gray";
                }
            }
        }
    }

    resetKeyColours() {
        this.keyColours = {};
    }

    // --- Hover detection ---

    HOVER_TARGET = 1.08;
    HOVER_EASE = 0.15;

    _updateHover() {
        const [mx, my] = this._windowToLogical([this.mouseX, this.mouseY]);
        this.hoveredButton = null;
        if (mx === null) return;

        if (this.state === "title") {
            if (this.titleEntranceFrame >= this.HELP_TRIGGER) {
                if (this._pointInRect(mx, my, START_RECT)) {
                    this.hoveredButton = "start";
                } else if (this._pointInRect(mx, my, QUIT_RECT)) {
                    this.hoveredButton = "quit";
                } else if (this._pointInRect(mx, my, HELP_RECT)) {
                    this.hoveredButton = "help";
                }
            }
        } else if (this.state === "playing") {
            if (this._pointInRect(mx, my, this.hardButtonRect)) {
                this.hoveredButton = "hard";
            } else if (this._pointInRect(mx, my, this.menuButtonRect)) {
                this.hoveredButton = "menu";
            } else {
                for (const [label, rect] of this.keyRects) {
                    if (this._pointInRect(mx, my, rect)) {
                        this.hoveredButton = label;
                        break;
                    }
                }
            }
        }
    }

    tickHover() {
        const target = this.hoveredButton !== null ? this.HOVER_TARGET : 1.0;
        this.hoverScale += (target - this.hoverScale) * this.HOVER_EASE;
    }

    // --- Click shrink/grow ---

    CLICK_STIFFNESS = 0.22;
    CLICK_DAMPING = 0.28;
    CLICK_SHRINK = 0.92;
    CLICK_GROW = 1.15;

    _setClickDown(button) {
        this.pressedButton = button;
        this.clickButton = button;
        this.clickScale = this.CLICK_SHRINK;
        this.clickVel = 0.0;
        this.clickPhase = "pressed";
    }

    _setClickUp() {
        if (this.pressedButton !== null) {
            this.clickScale = this.CLICK_GROW;
            this.clickVel = 0.0;
            this.clickPhase = "released";
            this.pressedButton = null;
        }
    }

    tickClick() {
        if (this.clickPhase === "pressed") {
            this.clickScale = this.CLICK_SHRINK;
        } else if (this.clickPhase === "released") {
            const target = this.clickButton === this.hoveredButton ? this.HOVER_TARGET : 1.0;
            const force = (target - this.clickScale) * this.CLICK_STIFFNESS;
            this.clickVel += force;
            this.clickVel *= (1.0 - this.CLICK_DAMPING);
            this.clickScale += this.clickVel;
            if (Math.abs(this.clickScale - target) < 0.008 && Math.abs(this.clickVel) < 0.005) {
                this.clickScale = 1.0;
                this.clickVel = 0.0;
                this.clickPhase = "idle";
                this.clickButton = null;
            }
        }
    }

    _hoverExtra(key) {
        if (this.clickButton !== null && this.clickPhase !== "idle" && key === this.clickButton) {
            return this.clickScale;
        }
        if (this.hoveredButton === key) {
            return this.hoverScale;
        }
        return 1.0;
    }

    _handleMouseDown() {
        const [mx, my] = this._windowToLogical([this.mouseX, this.mouseY]);
        if (mx === null) return;

        if (this.state === "title") {
            if (this._pointInRect(mx, my, START_RECT)) {
                this._setClickDown("start");
            } else if (this._pointInRect(mx, my, QUIT_RECT)) {
                this._setClickDown("quit");
            }
        } else if (this.state === "reveal") {
            this._setClickDown("reveal");
        } else if (this.state === "playing") {
            if (this._pointInRect(mx, my, this.hardButtonRect)) {
                this._setClickDown("hard");
            } else if (this._pointInRect(mx, my, this.menuButtonRect)) {
                this._setClickDown("menu");
            } else {
                for (const [label, rect] of this.keyRects) {
                    if (this._pointInRect(mx, my, rect)) {
                        this._setClickDown(label);
                        break;
                    }
                }
            }
        }
    }

    // --- Title stamp entrance ---

    spawnTitleStamp() {
        const title = this.assets.getTitle();
        if (!title) return;
        const tw = title.width;
        this.titleEntranceFrame = 0;
        this.startStamp = null;
        this.quitStamp = null;
        this.highScoreStamp = null;
        this.titleStamp = new StampEffect(title, Math.floor(BASE_W / 2), 130, 0, tw * 2, null, true);
    }

    _composeHighScoreSurface(game) {
        const best = game.getHighScore();
        const labelH = 40, numH = 28, gap = 4;

        const label = this.assets.getButton("HIGH_SCORE_sprite");
        let labelW, labelH2;
        if (label) {
            const lw = label.width, lh = label.height;
            const scale = labelH / lh;
            labelW = Math.max(1, Math.floor(lw * scale));
            labelH2 = Math.max(1, Math.floor(lh * scale));
        } else {
            labelW = 100; labelH2 = 18;
        }

        const digits = this._hsDigitsToSurfs(best);
        let totalNumW = 0;
        let digitSurfs = [];
        if (digits.length > 0) {
            for (const d of digits) {
                const scale = numH / d.height;
                const dw = Math.max(1, Math.floor(d.width * scale));
                digitSurfs.push([d, dw]);
                totalNumW += dw + 3;
            }
            totalNumW -= 3;
        } else {
            totalNumW = String(best).length * 12;
        }

        const totalW = Math.max(labelW, totalNumW);
        const totalH = labelH2 + gap + numH;
        const surf = document.createElement("canvas");
        surf.width = totalW; surf.height = totalH;
        const sctx = surf.getContext("2d");

        const labelX = Math.floor((totalW - labelW) / 2);
        if (label) {
            sctx.drawImage(label, labelX, 0, labelW, labelH2);
        } else {
            sctx.fillStyle = TEXT_BRIGHT;
            sctx.font = "bold 18px Arial";
            sctx.textAlign = "center";
            sctx.textBaseline = "alphabetic";
            sctx.fillText("HIGH SCORE", Math.floor(totalW / 2), labelH2);
        }

        const numY = labelH2 + gap;
        if (digitSurfs.length > 0) {
            let nx = Math.floor((totalW - totalNumW) / 2);
            for (const [d, dw] of digitSurfs) {
                sctx.drawImage(d, nx, numY, dw, numH);
                nx += dw + 3;
            }
        } else {
            sctx.fillStyle = TEXT_BRIGHT;
            sctx.font = "bold 18px Arial";
            sctx.textAlign = "center";
            sctx.fillText(String(best), Math.floor(totalW / 2), numY + numH);
        }

        return surf;
    }

    tickTitleEntrance(game) {
        this.titleEntranceFrame += 1;
        const f = this.titleEntranceFrame;

        if (f === this.START_TRIGGER && this.startStamp === null) {
            const startBtn = this.assets.getButton("Says_Start");
            if (startBtn) {
                this.startStamp = new StampEffect(startBtn,
                    Math.floor(START_RECT.x + START_RECT.w / 2),
                    Math.floor(START_RECT.y + START_RECT.h / 2),
                    0, startBtn.width, null);
            }
        } else if (f === this.QUIT_TRIGGER && this.quitStamp === null) {
            const quitBtn = this.assets.getButton("Says_Quit");
            if (quitBtn) {
                this.quitStamp = new StampEffect(quitBtn,
                    Math.floor(QUIT_RECT.x + QUIT_RECT.w / 2),
                    Math.floor(QUIT_RECT.y + QUIT_RECT.h / 2),
                    0, quitBtn.width, null);
            }
        } else if (f === this.HIGH_SCORE_TRIGGER && this.highScoreStamp === null) {
            const hsSurf = this._composeHighScoreSurface(game);
            if (hsSurf) {
                this.highScoreStamp = new StampEffect(hsSurf,
                    Math.floor(BASE_W / 2), 336, 0, hsSurf.width, null);
            }
        } else if (f === this.HELP_TRIGGER && this.helpStamp === null) {
            const helpBtn = this.assets.getButton("Help");
            if (helpBtn) {
                this.helpStamp = new StampEffect(helpBtn,
                    Math.floor(HELP_RECT.x + HELP_RECT.w / 2),
                    Math.floor(HELP_RECT.y + HELP_RECT.h / 2),
                    0, HELP_RECT.w, null);
            }
        }

        if (this.titleStamp) this.titleStamp.update();
        if (this.startStamp) this.startStamp.update();
        if (this.quitStamp) this.quitStamp.update();
        if (this.highScoreStamp) this.highScoreStamp.update();
        if (this.helpStamp) this.helpStamp.update();
    }

    clearTitleStamps() {
        this.titleStamp = null;
        this.startStamp = null;
        this.quitStamp = null;
        this.highScoreStamp = null;
        this.helpStamp = null;
        this.titleEntranceFrame = 0;
    }

    // --- No-point stamp ---

    spawnNoPointStamp() {
        if (!this.assets.hasStamps()) return;
        const image = this.assets.getStamp();
        if (!image) return;
        const positions = [
            [252, 80], [120, 80], [384, 80],
            [252, 490], [120, 490], [384, 490],
        ];
        const [cx, cy] = positions[Math.floor(Math.random() * positions.length)];
        const rotation = Math.random() * 40 - 20;
        this.stampEffect = new StampEffect(image, cx, cy, rotation);
    }

    tickStamp() {
        if (this.stampEffect) this.stampEffect.update();
    }

    clearStamp() {
        this.stampEffect = null;
    }

    // --- Lifecycle ---

    setState(state) {
        this.state = state;
        // Clear help layout + stamps when leaving help state
        if (state !== "help") {
            this._helpLayout = null;
            this.helpStamps = [];
            this.helpEntranceFrame = 0;
        }
    }
    setRevealMode(mode) { this.revealMode = mode; }

    // --- Utility ---

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}