# Vandal Runes

An offline endless Wordle game with a DND/mythology/fantasy theme.

Play it in your browser — no install, no server, no dependencies.

## Play Online

1. Clone or download this folder.
2. Run a local server:
   ```
   python -m http.server 8080
   ```
3. Open `http://localhost:8080/` in your browser.

Or host it on any static site (GitHub Pages, Netlify, Vercel, itch.io) — just upload the folder.

## How to Play

Guess the hidden 5-letter word in 6 tries.

- 🟩 **Green** — right letter, right spot
- 🟧 **Orange** — right letter, wrong spot
- ⬛ **Gray** — letter not in the word

Solve words in a row to build your streak. Fail a word and your streak resets.

**Hard mode (H):** Reuse revealed letters in every guess. Earn a point even on the last guess.

**Last guess:** Easy mode shows a hint but gives no point. Hard mode gives no hint but earns the point.

## Controls

- Type letters, **Enter** to submit, **Backspace** to delete
- **H** to toggle hard mode
- **ESC** to return to title
- Mouse/touch supported for all on-screen buttons

## Features

- 2055 themed answer words with definitions
- 14,887 valid guess words
- Streak and high score tracking (saved in browser localStorage)
- Hard mode with last-guess scoring rules
- Definition reveal overlay on solve/fail
- Animated stamp entrance on title screen
- Ambient background particles (embers, dust, snow)
- Hover and click animations on all buttons
- Responsive scaling to fit any window size
- Pixel art sprite rendering

## Project Structure

```
VandleRunesOnline/
  index.html          Entry point
  style.css           Layout and rendering styles
  js/
    game.js           Pure game logic (word lists, colours, streak, save)
    assets.js         Sprite loader (PNGs, letter/digit crops)
    display.js        Canvas rendering (grid, keyboard, animations)
    main.js           Game loop, input handling, state machine
  data/
    VandalRunesAnswers.txt   2055 themed words + definitions
    guesses.txt              14887 valid guesses
  Sprites/                   All sprite art (letters, digits, backgrounds, stamps)
  LICENSE                    GPL-3.0
```

## License

GPL-3.0 — see [LICENSE](LICENSE).