/**
 * game.js — Pure game logic for the offline endless Wordle game.
 *
 * Port of src/game.py. No UI dependencies. All game logic: word list
 * loading, guess checking (two-pass colour algorithm), answer picking
 * (no-repeat), turn flow, hard mode validation, streak/high-score
 * tracking, and save/load via localStorage.
 */

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

const GREEN = "green";
const YELLOW = "yellow";
const GRAY = "gray";

const SAVE_KEY = "vandal_runes_state";

/**
 * Load a word list from text content. Returns an array of uppercase
 * 5-letter words. Handles both plain word lists and WORD|Definition format
 * (only the word part before the pipe is used).
 */
function loadWords(text) {
    const words = [];
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const word = trimmed.split("|")[0].trim().toUpperCase();
        if (word.length !== WORD_LENGTH) continue;
        if (!/^[A-Z]+$/.test(word)) continue;
        words.push(word);
    }
    return words;
}

/**
 * Load word→definition pairs from text content.
 * Returns a Map mapping uppercase word to definition string.
 */
function loadDefinitions(text) {
    const defs = new Map();
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes("|")) continue;
        const idx = trimmed.indexOf("|");
        const word = trimmed.substring(0, idx).trim().toUpperCase();
        const definition = trimmed.substring(idx + 1).trim();
        defs.set(word, definition);
    }
    return defs;
}

/**
 * Two-pass colour algorithm for a guess against an answer.
 * Returns an array of colour strings ("green", "yellow", "gray").
 */
function checkGuess(guess, answer) {
    const colours = new Array(WORD_LENGTH).fill(GRAY);
    const answerChars = answer.split("");

    // First pass: exact matches
    for (let i = 0; i < WORD_LENGTH; i++) {
        if (guess[i] === answerChars[i]) {
            colours[i] = GREEN;
            answerChars[i] = null; // consume
        }
    }

    // Second pass: present but misplaced
    for (let i = 0; i < WORD_LENGTH; i++) {
        if (colours[i] === GREEN) continue;
        const idx = answerChars.indexOf(guess[i]);
        if (idx !== -1) {
            colours[i] = YELLOW;
            answerChars[idx] = null; // consume
        }
    }

    return colours;
}

class Game {
    /**
     * @param {string[]} answers - array of answer words
     * @param {Map} definitions - map of word→definition
     * @param {Set} guesses - set of valid guess words
     */
    constructor(answers, definitions, guesses) {
        this.answers = answers;
        this.definitions = definitions;
        this.guesses = guesses;
        this.hardMode = false;

        // Validate: every answer should be in the guess list
        const missing = answers.filter(w => !guesses.has(w));
        if (missing.length > 0) {
            console.warn(`${missing.length} answer(s) not in guess list, e.g.`, missing.slice(0, 3));
        }

        this.state = this._loadState();
        this.currentAnswer = null;
        this.guessHistory = []; // array of {word, colours}
        this.solved = false;
        this.failed = false;
        this._pickAnswer();
    }

    // --- Answer picking with no-repeat ---

    _pickAnswer() {
        const used = new Set(this.state.usedAnswers);
        let available = this.answers.filter(w => !used.has(w));
        if (available.length === 0) {
            this.state.usedAnswers = [];
            available = [...this.answers];
        }
        this.currentAnswer = available[Math.floor(Math.random() * available.length)];
        this.guessHistory = [];
        this.solved = false;
        this.failed = false;
    }

    // --- Save and load (localStorage) ---

    _loadState() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) throw new Error("no save");
            const state = JSON.parse(raw);
            if (state.highScore === undefined || state.currentStreak === undefined || state.usedAnswers === undefined) {
                throw new Error("missing keys");
            }
            return state;
        } catch (e) {
            return { highScore: 0, currentStreak: 0, usedAnswers: [] };
        }
    }

    _saveState() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
        } catch (e) {
            // localStorage might be full or disabled — ignore
        }
    }

    // --- Turn and game flow ---

    isValidGuess(word) {
        return word.length === WORD_LENGTH && /^[A-Z]+$/.test(word) && this.guesses.has(word);
    }

    checkHardMode(word) {
        if (!this.hardMode || this.guessHistory.length === 0) {
            return { ok: true, error: "" };
        }

        const greenPositions = {}; // position → letter
        const minLetterCounts = {}; // letter → min count

        for (const { word: prevGuess, colours: prevColours } of this.guessHistory) {
            const revealedCounts = {};
            for (let i = 0; i < WORD_LENGTH; i++) {
                const letter = prevGuess[i];
                const colour = prevColours[i];
                if (colour === GREEN) {
                    greenPositions[i] = letter;
                    revealedCounts[letter] = (revealedCounts[letter] || 0) + 1;
                } else if (colour === YELLOW) {
                    revealedCounts[letter] = (revealedCounts[letter] || 0) + 1;
                }
            }
            for (const [letter, count] of Object.entries(revealedCounts)) {
                if (count > (minLetterCounts[letter] || 0)) {
                    minLetterCounts[letter] = count;
                }
            }
        }

        // Check green positions
        for (const [pos, letter] of Object.entries(greenPositions)) {
            if (word[parseInt(pos)] !== letter) {
                return { ok: false, error: `Green ${letter} must stay at position ${parseInt(pos) + 1}` };
            }
        }

        // Check minimum letter counts
        const wordCounts = {};
        for (const c of word) {
            wordCounts[c] = (wordCounts[c] || 0) + 1;
        }
        for (const [letter, minCount] of Object.entries(minLetterCounts)) {
            if ((wordCounts[letter] || 0) < minCount) {
                return { ok: false, error: `Must use ${letter} at least ${minCount}x` };
            }
        }

        return { ok: true, error: "" };
    }

    /**
     * Submit a guess. Returns { colours, status } or { error, status }.
     * Status is one of: "solved", "failed", "continue", "invalid".
     */
    submitGuess(word) {
        word = word.toUpperCase();
        if (this.solved || this.failed) {
            return { colours: null, status: "invalid", error: "Game already ended" };
        }
        if (!this.isValidGuess(word)) {
            return { colours: null, status: "invalid", error: "Not a valid word" };
        }
        const { ok, error } = this.checkHardMode(word);
        if (!ok) {
            return { colours: null, status: "invalid", error };
        }

        const colours = checkGuess(word, this.currentAnswer);
        this.guessHistory.push({ word, colours });

        if (word === this.currentAnswer) {
            this.solved = true;
            // Only award a point unless this was the final guess in easy mode.
            // Hard mode earns the point even on the last guess.
            const isLastGuess = this.guessHistory.length >= MAX_GUESSES;
            if (!isLastGuess || this.hardMode) {
                this.state.currentStreak += 1;
                this.state.highScore = Math.max(this.state.highScore, this.state.currentStreak);
            }
            this.state.usedAnswers.push(this.currentAnswer);
            this._saveState();
            return { colours, status: "solved" };
        }

        if (this.guessHistory.length >= MAX_GUESSES) {
            this.failed = true;
            this.state.currentStreak = 0;
            this.state.usedAnswers.push(this.currentAnswer);
            this._saveState();
            return { colours, status: "failed" };
        }

        return { colours, status: "continue" };
    }

    nextWord() {
        this._pickAnswer();
    }

    // --- Accessors ---

    getAnswer() { return this.currentAnswer; }
    getDefinition(word) {
        if (!word) word = this.currentAnswer;
        return this.definitions.get(word) || "";
    }
    getStreak() { return this.state.currentStreak; }
    getHighScore() { return this.state.highScore; }
    getGuessCount() { return this.guessHistory.length; }
    getGuessHistory() { return this.guessHistory; }
    setHardMode(on) { this.hardMode = on; }
    isHardMode() { return this.hardMode; }
}