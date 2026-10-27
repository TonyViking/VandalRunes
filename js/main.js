/**
 * main.js — Entry point for the offline endless Wordle game.
 *
 * Port of src/main.py. Wires the game logic (game.js) to the display
 * (display.js) and runs the endless loop. Starts on a title screen;
 * Start enters gameplay, Quit exits. Manages the current input buffer,
 * submits guesses, handles solve/fail transitions, and toggles hard mode.
 */

// MAX_GUESSES and WORD_LENGTH are defined in game.js

let game, display;
let inputBuffer = "";
let running = true;
let transitionTimer = 0;
let pendingReveal = false;
let pendingNoPointStamp = false;

// Action queue — both mouse and keyboard push here, game loop consumes
let actionQueue = [];

function pushAction(action, data) {
    actionQueue.push({ action, data });
}

function popAction() {
    if (actionQueue.length === 0) return { action: null, data: null };
    return actionQueue.shift();
}

async function init() {
    const loading = document.getElementById("loading");

    try {
        // Load word lists
        const [answersText, guessesText] = await Promise.all([
            fetch("data/VandalRunesAnswers.txt").then(r => r.text()),
            fetch("data/guesses.txt").then(r => r.text()),
        ]);

        const answers = loadWords(answersText);
        const definitions = loadDefinitions(answersText);
        const guesses = new Set(loadWords(guessesText));

        // Create game and display
        game = new Game(answers, definitions, guesses);
        const assets = new AssetLoader("Sprites");
        await assets.loadAll();
        display = new Display(assets);
        display.setState("title");
        display.spawnTitleStamp();

        loading.style.display = "none";

        // Start the game loop
        requestAnimationFrame(gameLoop);
    } catch (e) {
        loading.textContent = "Error loading game: " + e.message;
        console.error(e);
    }
}

function gameLoop() {
    if (!running) return;

    // Update hover and click
    display._updateHover();
    display.tickHover();
    display.tickClick();

    // Consume one action per frame
    const { action, data } = popAction();

    // --- Title screen ---
    if (display.state === "title") {
        if (action === "start") {
            display.setState("playing");
            display.pickNewBackground();
            display.resetKeyColours();
            inputBuffer = "";
        } else if (action === "quit") {
            // In a browser, go back to title (can't really quit)
            display.spawnTitleStamp();
        } else if (action === "help") {
            display.setState("help");
        }
        display.tickMessage();
        display.tickFlash();
        display.tickParticles();
        display.tickTitleEntrance(game);
        display.draw(game, "");
        requestAnimationFrame(gameLoop);
        return;
    }

    // --- Help screen ---
    if (display.state === "help") {
        if (action === "back" || action === "continue") {
            display.setState("title");
            display.spawnTitleStamp();
        }
        display.tickMessage();
        display.tickFlash();
        display.tickParticles();
        display.tickHelpEntrance();
        display.draw(game, "");
        requestAnimationFrame(gameLoop);
        return;
    }

    // --- Reveal overlay ---
    if (display.state === "reveal") {
        if (action === "continue") {
            display.clearStamp();
            if (display.revealMode === "failed") {
                display.setState("title");
                display.spawnTitleStamp();
            } else {
                game.nextWord();
                display.pickNewBackground();
                display.resetKeyColours();
                display.setState("playing");
            }
            inputBuffer = "";
        }
        display.tickMessage();
        display.tickFlash();
        display.tickParticles();
        display.tickStamp();
        display.draw(game, "");
        requestAnimationFrame(gameLoop);
        return;
    }

    // --- Gameplay ---
    if (transitionTimer > 0) {
        transitionTimer -= 1;
        display.tickMessage();
        display.tickFlash();
        display.tickParticles();
        display.tickAmbient();
        display.draw(game, "");
        if (transitionTimer === 0) {
            if (pendingReveal) {
                pendingReveal = false;
                display.setRevealMode("solved");
                if (pendingNoPointStamp) {
                    pendingNoPointStamp = false;
                    display.spawnNoPointStamp();
                }
                display.setState("reveal");
            } else {
                game.nextWord();
                display.pickNewBackground();
                display.resetKeyColours();
                inputBuffer = "";
            }
        }
        requestAnimationFrame(gameLoop);
        return;
    }

    if (game.solved || game.failed) {
        game.nextWord();
        display.pickNewBackground();
        display.resetKeyColours();
        inputBuffer = "";
        display.updateKeyColours(game);
    }

    if (action === "toggle_hard") {
        if (game.getGuessCount() >= MAX_GUESSES - 1) {
            display.setMessage("Can't toggle hard on last guess", 90);
        } else {
            game.setHardMode(!game.isHardMode());
            display.setMessage(`Hard mode ${game.isHardMode() ? "ON" : "OFF"}`, 60);
        }
    } else if (action === "menu") {
        display.setState("title");
        display.spawnTitleStamp();
        inputBuffer = "";
    } else if (action === "letter") {
        if (inputBuffer.length < WORD_LENGTH) {
            inputBuffer += data;
        }
    } else if (action === "back") {
        if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1);
        }
    } else if (action === "enter") {
        submitGuess();
    }

    display.tickMessage();
    display.tickFlash();
    display.tickParticles();
    display.tickAmbient();
    display.draw(game, inputBuffer);
    requestAnimationFrame(gameLoop);
}

function submitGuess() {
    if (inputBuffer.length !== WORD_LENGTH) {
        display.setMessage("Not enough letters", 60);
        return;
    }

    const oldHigh = game.getHighScore();
    const result = game.submitGuess(inputBuffer);
    if (result.colours === null) {
        display.setMessage(result.error || "Invalid", 90);
        display.setFlash();
        return;
    }

    display.updateKeyColours(game);
    inputBuffer = "";

    if (result.status === "solved") {
        const isLast = game.getGuessCount() >= MAX_GUESSES;
        if (isLast && !game.isHardMode()) {
            display.setMessage("No point — last guess", 90);
            pendingNoPointStamp = true;
        } else {
            display.spawnConfetti();
            if (isLast) {
                if (game.getHighScore() > oldHigh) {
                    display.spawnFireworks();
                    display.setMessage("Hard earned! New best!", 120);
                } else {
                    display.setMessage("Hard earned!", 120);
                }
            } else if (game.getHighScore() > oldHigh) {
                display.spawnFireworks();
                display.setMessage("New best!", 120);
            } else {
                display.setMessage("Solved!", 60);
            }
        }
        transitionTimer = 60;
        pendingReveal = true;
    } else if (result.status === "failed") {
        display.setRevealMode("failed");
        display.setState("reveal");
        inputBuffer = "";
    }
}

// --- Mouse input ---

// Override the Display's _setClickUp to also push an action
const _originalSetClickUp = display ? display._setClickUp.bind(display) : null;

function setupMouseInput() {
    display.canvas.addEventListener("mousemove", (e) => {
        const rect = display.canvas.getBoundingClientRect();
        display.mouseX = e.clientX - rect.left;
        display.mouseY = e.clientY - rect.top;
    });

    display.canvas.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        const rect = display.canvas.getBoundingClientRect();
        display.mouseX = e.clientX - rect.left;
        display.mouseY = e.clientY - rect.top;
        handleMouseClick();
    });

    display.canvas.addEventListener("mouseup", (e) => {
        if (e.button !== 0) return;
        display._setClickUp();
    });

    // Touch support
    display.canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = display.canvas.getBoundingClientRect();
        display.mouseX = touch.clientX - rect.left;
        display.mouseY = touch.clientY - rect.top;
        handleMouseClick();
    }, { passive: false });

    display.canvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        display._setClickUp();
    }, { passive: false });
}

function handleMouseClick() {
    const [mx, my] = display._windowToLogical([display.mouseX, display.mouseY]);
    if (mx === null) return;

    if (display.state === "title") {
        if (display._pointInRect(mx, my, START_RECT)) {
            display._setClickDown("start");
            pushAction("start");
        } else if (display._pointInRect(mx, my, QUIT_RECT)) {
            display._setClickDown("quit");
            pushAction("quit");
        } else if (display._pointInRect(mx, my, HELP_RECT)) {
            display._setClickDown("help");
            pushAction("help");
        }
    } else if (display.state === "help") {
        display._setClickDown("help-back");
        pushAction("back");
    } else if (display.state === "reveal") {
        display._setClickDown("reveal");
        pushAction("continue");
    } else if (display.state === "playing") {
        if (display._pointInRect(mx, my, display.hardButtonRect)) {
            display._setClickDown("hard");
            pushAction("toggle_hard");
        } else if (display._pointInRect(mx, my, display.menuButtonRect)) {
            display._setClickDown("menu");
            pushAction("menu");
        } else {
            for (const [label, rect] of display.keyRects) {
                if (display._pointInRect(mx, my, rect)) {
                    display._setClickDown(label);
                    if (label === "ENTER") {
                        pushAction("enter");
                    } else if (label === "BACK") {
                        pushAction("back");
                    } else {
                        pushAction("letter", label);
                    }
                    break;
                }
            }
        }
    }
}

// --- Keyboard input ---

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (display.state === "playing") {
            pushAction("menu");
        } else if (display.state === "help") {
            pushAction("back");
        }
        e.preventDefault();
        return;
    }

    if (display.state === "title") {
        if (e.key === "Enter" || e.key === " ") {
            pushAction("start");
            e.preventDefault();
        }
        return;
    }

    if (display.state === "help") {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
            pushAction("back");
            e.preventDefault();
        }
        return;
    }

    if (display.state === "reveal") {
        if (e.key === "Enter" || e.key === " ") {
            pushAction("continue");
            e.preventDefault();
        }
        return;
    }

    // Playing state
    if (e.key === "Enter") {
        pushAction("enter");
        e.preventDefault();
    } else if (e.key === "Backspace") {
        pushAction("back");
        e.preventDefault();
    } else if (/^[a-zA-Z]$/.test(e.key)) {
        pushAction("letter", e.key.toUpperCase());
        e.preventDefault();
    }
});

// Start the game — init() runs async, then sets up mouse input and starts the loop
init().then(() => {
    setupMouseInput();
});