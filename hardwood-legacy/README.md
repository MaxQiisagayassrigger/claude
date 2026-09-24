# Hardwood Legacy

A browser basketball career game in the style of 2K's MyCareer. You build a player, get drafted, earn minutes, upgrade your attributes and chase a ring. Every game is simulated one possession at a time from the ratings of the ten players on the floor.

There is no build step and there are no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000/hardwood-legacy/
```

## How a career goes

1. **Create your player.** Pick a name, jersey, position (PG, SG, SF, PF, C), one of 13 builds (Sharpshooter, Slasher, Rim Protector, Stretch Big and others), and your height, weight and wingspan. Your body changes your attribute caps the same way it does in 2K. For example, a longer wingspan adds blocks and steals but costs jump-shot touch. Rookies start at about 60 OVR (lottery picks a point or two higher). The build decides your ceiling.
2. **Draft combine.** Ten spot-up threes with the shot meter, plus measurements. Your makes, your ceiling and your athleticism set your draft stock.
3. **Draft night.** The picks come in live. Your pick decides your team and your rookie contract. Bad teams pick first, so a high pick usually means more minutes.
4. **The season.** You can play any game live, sim it, or sim a week, to the All-Star break, or to the end of the season.
5. **Awards, playoffs and the offseason.** Awards include MVP, DPOY, ROY, Sixth Man, the scoring title, All-NBA and All-Defensive teams. The playoffs are four best-of-seven rounds. In the offseason you age, sign endorsements and, when your contract ends, choose between free-agent offers. You can retire in any offseason. Your legacy score gives a Hall of Fame verdict.

## Playing a game live

The game pauses whenever the ball comes to you:

- **On offense** you see how the defense is playing you (sagging, pressed up tight, a switch, help collapsing, the shot clock running down). You choose between a three, a mid-range jumper, attacking the rim, posting up, passing to an open teammate, or a size-up dribble move. Each option shows how open you are and your make chance before timing.
- **On defense**, when your man attacks, you can stay in front, gamble for a steal, or sag off to protect the paint.
- **The shot meter**: tap Release (or press Space) as the bar crosses the green window. The window gets wider with a higher rating, a better look and the Ice Veins badge, and narrower on harder difficulties. A green release nearly always goes in when you're open. You also shoot your own free throws.

Keyboard: `1`–`6` choose an option, and `Space` releases the meter. Speed can be set to Watch, Fast, or Skip to my plays. Sim to final auto-plays the rest of the game.

## The ratings

- **21 attributes in 6 categories:** Finishing, Shooting, Playmaking, Defense, Rebounding and Physicals. Each attribute has a cap set by your build.
- **Overall** is a position-weighted blend of your average and your five best key skills, so specialists rate the way they do in 2K.
- **16 badges**, each from Bronze to Hall of Fame (Sniper, Rim Wrecker, Floor General, Lockdown, Rim Protector, Clutch Gene, Tireless and others). They unlock automatically from your ratings and change the simulation math.
- **VC** comes from each game, based on your teammate grade, points and wins, and from season goals, awards and endorsements. You spend it on upgrades, which get more expensive as a rating rises. You can also pick a training focus between games to earn free points in one category.
- **Coach trust** moves with your teammate grade. It changes your minutes and can move you into the starting lineup.

## The simulation (`js/sim.js`)

Each possession runs these steps in order:

1. Rotation check
2. Turnover roll (ball handling vs. steals and perimeter defense)
3. Shooter chosen by usage
4. Shot type chosen from the shooter's tendencies
5. Make chance from the shooter vs. his defender and the rim protector, badges, fatigue, home court and how open the shot is
6. Blocks, shooting fouls, and-ones and free throws
7. Assists and rebounds

Minutes follow per-player targets by roster rank, and fatigue brings starters back in close fourth quarters. Players foul out at six fouls.

A full 82-game season (1,230 games) simulates in about a second. League averages land close to the modern NBA:

| Per team, per game | Sim | NBA 2024-25 |
|---|---|---|
| Points | ~111 | ~114 |
| FG% | ~47% | ~47% |
| 3PA / 3P% | ~35 / ~36% | ~37 / ~36% |
| FT% | ~79% | ~78% |
| Assists | ~25 | ~27 |
| Turnovers | ~13.5 | ~14 |
| Steals / Blocks | ~7.5 / ~4.5 | ~8 / ~5 |

## Files

| File | What it does |
|---|---|
| `js/data.js` | Attributes, position templates and OVR weights, builds, badges, the 30 teams, names |
| `js/player.js` | Seeded RNG, OVR formula, player generation, the builder, badges, aging |
| `js/sim.js` | The game engine and the live decisions (offense, defense, free throws, shot meter math) |
| `js/league.js` | Schedule, standings, stats, VC, trust, goals, All-Stars, awards, playoffs, contracts, trades, offseason |
| `js/ui.js` | Every screen, rendered as HTML strings |
| `js/app.js` | State, actions, saves, the meter animation, the live game loop, batch sims |
| `css/style.css` | Styles |

Your career saves to `localStorage` after every game. **Settings → Copy save code** backs it up, and **Import save code** on the title screen restores it.

Teams use real NBA cities with made-up nicknames, and every player is fictional. To rename teams, edit `TEAMS` in `js/data.js`.

## Tests

```bash
node hardwood-legacy/tests/sim.test.js
```

The tests cover:

- Generated players hit their target OVR.
- Build caps and starting ratings are valid.
- Upgrades respect VC and caps.
- Box scores add up: points, 5 × 48 minutes and five starters.
- A full season produces NBA-like averages.
- Interactive games resolve offense, defense and free-throw decisions.
- The playoffs crown a champion, and rosters stay whole through the offseason.
- Trades keep roster sizes.
- Saves round-trip through JSON.
