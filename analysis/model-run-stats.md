# Astrolabe model test — run statistics

Extracted from the Open Design app database (`app.sqlite`) and per-run event logs
(`runs/<run-id>/events.jsonl`). All times are local (machine timezone).

**How to read this:** a *turn* is one user prompt and the assistant run it triggered.
“Model calls” are model steps inside a run (tool-loop iterations). “Total tokens” follows
each runtime’s reporting and **includes cached context re-reads**, so it reflects context
volume, not just generated text. For DS 4.1 F and GLM 5.3 Flash, cost is computed from
standard list prices (below); for Fable 5.1 and Opus 5.5 it is the cost recorded by the app.

## Summary

| Version | Model | Turns | Model calls | Wall clock | Active time | Total tokens | Cost |
|---|---|---|---|---|---|---|---|
| `ds-4.1-f` | OpenDesign · deepseek-v4.1-flash | 10 | 196 | 72.2 min | 44.2 min | 19,953,301 | ≈$0.30ᶜ |
| `glm-5.3-flash` | OpenDesign · glm-5.3-flash | 4 | 37 | 58.5 min | 50.9 min | 2,873,541 | ≈$0.14ᶜ |
| `fable-5.1` | Claude · fable | 1 | 19 | 20.0 min | 19.9 min | 2,012,458 | $7.78ʳ |
| `opus-5.5` | Claude · opus | 1 | 20 | 30.1 min | 30.0 min | 3,722,654 | $6.28ʳ |
| **all four** | | **16** | **272** | 90 min span | **145.0 min** | **28,561,954** | **≈$14.50** |

ᶜ computed from standard list prices · ʳ recorded by the app

## Token breakdown (whole session)

| Version | Fresh input | Cache write | Cache read | Output | Reasoning/thinking | Total |
|---|---|---|---|---|---|---|
| `ds-4.1-f` | 140,298 | 0 | 19,446,912 | 57,997 | 308,094 | 19,953,301 |
| `glm-5.3-flash` | 137,918 | 0 | 2,664,320 | 26,949 | 44,354 | 2,873,541 |
| `fable-5.1` | 578 | 142,423 | 1,779,774 | 89,683 | 55,502* | 2,012,458 |
| `opus-5.5` | 40 | 237,179 | 3,299,470 | 185,965 | 130,645* | 3,722,654 |

\* For the Claude runs, thinking tokens are included in the output figure (shown for info).
For DS 4.1 F and GLM 5.3 Flash, reasoning tokens are reported separately and are included in the total.

## Standard list prices used

| Model | Input ($/M) | Output ($/M) | Cache read ($/M) | Cache write ($/M) |
|---|---|---|---|---|
| deepseek-v4.1-flash | 0.15 | 0.60 | 0.003 | 0 |
| glm-5.3-flash | 0.15 | 0.50 | 0.03 | 0 |

Reasoning tokens are billed as output for both. No cache writes were logged for these runs.

## Sessions in time

| Version | First prompt | Last output | Wall clock |
|---|---|---|---|
| `ds-4.1-f` | 2026-09-26 09:14 | 2026-09-26 10:26 | 72.2 min |
| `glm-5.3-flash` | 2026-09-26 08:56 | 2026-09-26 09:54 | 58.5 min |
| `fable-5.1` | 2026-09-26 09:52 | 2026-09-26 10:12 | 20.0 min |
| `opus-5.5` | 2026-09-26 09:43 | 2026-09-26 10:13 | 30.1 min |

## Turn-by-turn detail

### `ds-4.1-f` — OpenDesign · deepseek-v4.1-flash

Prompt: “@threejs  make 3d model of this Islamic Astrolabe, must have their engrave and each ring must rotatable…”

| Turn | Time | Model calls | Fresh in | Cache read | Output | Total |
|---|---|---|---|---|---|---|
| 1 | 395 s | 17 | 28,768 | 1,327,744 | 19,755 | 1,435,606 |
| 2 | 261 s | 14 | 14,661 | 2,104,320 | 6,877 | 2,165,279 |
| 3 | 136 s | 11 | 3,859 | 1,995,520 | 6,003 | 2,021,239 |
| 4 | 251 s | 15 | 20,884 | 604,160 | 1,593 | 661,240 |
| 5 | 292 s | 21 | 19,975 | 1,969,792 | 4,177 | 2,033,038 |
| 6 | 161 s | 11 | 4,589 | 1,301,504 | 1,897 | 1,327,050 |
| 7 | 380 s | 27 | 9,766 | 4,305,920 | 4,866 | 4,358,494 |
| 8 | 140 s | 14 | 4,569 | 2,573,824 | 2,385 | 2,588,156 |
| 9 | 409 s | 40 | 21,500 | 1,504,000 | 4,873 | 1,570,679 |
| 10 | 226 s | 26 | 11,727 | 1,760,128 | 5,571 | 1,792,520 |

### `glm-5.3-flash` — OpenDesign · glm-5.3-flash

Prompt: “@threejs make 3d model of this Islamic Astrolabe, must have their engrave and each ring must rotatable…”

| Turn | Time | Model calls | Fresh in | Cache read | Output | Total |
|---|---|---|---|---|---|---|
| 1 | 848 s | 9 | 88,139 | 290,752 | 13,351 | 408,802 |
| 2 | 1087 s | 14 | 31,439 | 1,049,024 | 8,041 | 1,108,635 |
| 3 | 587 s | 8 | 12,561 | 730,112 | 4,375 | 752,825 |
| 4 | 534 s | 6 | 5,779 | 594,432 | 1,182 | 603,279 |

### `fable-5.1` — Claude · fable

Prompt: “@threejs make 3d model of this Islamic Astrolabe, must have their engrave and each ring must rotatable…”

| Turn | Time | Model calls | Fresh in | Cache read | Output | Total |
|---|---|---|---|---|---|---|
| 1 | 1194 s | 19 | 578 | 1,779,774 | 89,683 | 2,012,458 |

### `opus-5.5` — Claude · opus

Prompt: “@threejs make 3d model of this Islamic Astrolabe, must have their engrave and each ring must rotatable…”

| Turn | Time | Model calls | Fresh in | Cache read | Output | Total |
|---|---|---|---|---|---|---|
| 1 | 1802 s | 20 | 40 | 3,299,470 | 185,965 | 3,722,654 |
