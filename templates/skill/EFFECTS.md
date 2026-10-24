# Effects reference

Every effect the engine can render, with when to use it. Times are OUTPUT seconds (after cuts). `start` and `dur` are required unless marked optional (`?`). Image and video sources are paths inside `projects/<slug>/assets/` or clip ids from `prep`.

## Say it the way they would

This file is the engine's own names, which is what goes in `edit.json`. It is not what to put in
front of the owner. Nobody asks for an `orbit`. They ask for cards spinning around their head, and
they only ask for it at all if somebody offered it in those words. The index below is the mapping,
and `library/catalog.json` is the source of it (`say` and `earns` on every entry). `library/effects-library.html`
is the same list with a still of each one, which is the page to open for them.

`earns` is the test: what has to be in a line they actually said before the effect is honest. An
effect offered against a line is a choice they can make. An effect offered on its own is a
decoration.

| Say this | What earns it | `type` in edit.json |
|---|---|---|
| your opening line in highlight bars | the first thing you say, when it has to be read before it is heard | `whole-reel style (hook-bars)` |
| a small opening line above your head | an opening where the shot is doing the work | `whole-reel style (hook-top)` |
| your opening line behind your head | an opening of two short words you want shouted | `whole-reel style (hook-behind)` |
| stacked captions with the loud word on top | the whole reel: the default caption look | `whole-reel style (cap-stack)` |
| a quiet lead-in over one huge word | the whole reel, when single words carry it | `whole-reel style (cap-phrase)` |
| one word at a time | the whole reel, when it is slow and story-led | `whole-reel style (cap-word)` |
| captions in a box | the whole reel, when the background is busy or bright | `whole-reel style (cap-box)` |
| captions that blur in | the whole reel, when it is reflective rather than punchy | `whole-reel style (cap-blur)` |
| captions with no punctuation | the whole reel, when they ask for a cleaner caption look | `captions.noPunct: true` |
| questions filling in one at a time | you ask people to check two or three things | `whole-reel style (checklist)` |
| a last card with your ask on it | the last line, where you ask for something | `whole-reel style (endcard)` |
| one giant word behind your head | a single word the whole reel hangs on | `bigword` |
| a big number in your quiet font | a numbered step, or one number said on its own | `bigword` |
| a word crossed out | you name the thing people should stop doing | `bigword` |
| a name tag under what you said | you say a person, a step or a section name | `label` |
| a name bar in your accent colour | you say your own show, product or company name | `label` |
| a number counting up | a number that changed, or grew | `counter` |
| a number rolling like a slot machine | a number that is the point of the reel | `counter` |
| a word burning onto the screen | a one-word verdict, and only once in a reel | `burn` |
| a glassy title behind you | you name a brand, platform or product | `glass` |
| the frame becomes a magazine cover | you start telling a story | `cover` |
| a paper cut-out chapter break | you change subject and want it to feel light | `paper` |
| an arrow pointing at something in the shot | you point at something that is really in frame | `annotate` |
| a question pinned to the top of the reel | the whole reel is answering one question | `header` |
| the whole screen goes your accent colour behind you | an opening line, or a clean break between sections | `colourbg` |
| a screenshot or clip rising up behind you | you say exactly what the screenshot shows | `backdrop` |
| a second shot stacked above you, joined by a blur | you talk about someone or something you have footage of | `band` |
| photos fanning out like a hand of cards | you say a set of things: clients, episodes, products | `deck` |
| photos snapping in, one flash at a time | you tell people to go and take photos of something | `deck` |
| a wall of photos | you claim volume: every client, every episode, all year | `deck` |
| headlines scattering around you | you mention press, reviews or DMs you have shots of | `deck` |
| cards spinning around your head | you list tools, guests or platforms | `orbit` |
| a cut-out photo popping in beside you | you name one thing you have a photo of | `sticker` |
| a logo popping in and getting crossed out | you say you do not need a particular tool | `sticker` |
| files dropping into a folder | you say to put things all in one place | `folder` |
| a phone showing a real post, views ticking up | you talk about a post that actually did something | `phone` |
| an envelope opening with your freebie in it | you offer something you will send people | `envelope` |
| your brand colours fanning out | you talk about branding, colours or fonts | `swatches` |
| a receipt of what it costs, then struck out | you say what something costs | `receipts` |
| the exact prompt typing itself out | you say the words you typed | `prompt` |
| a prompt with your files dropped into it | you say you handed files over to something | `prompt` |
| a real back-and-forth on screen | you quote both sides of a conversation | `chat` |
| notifications piling up | you describe something multiplying until it is painful | `pills` |
| a job list ticking itself off | you walk through a process that runs without you | `tasks` |
| a week filling in on a calendar | you talk about posting or planning across days | `calendar` |
| a menu opening and one option getting picked | you say you chose one setting or model | `dropdown` |
| a dial turning up to max | you say to do more of something | `dial` |
| a note with the lines crossed out | you list what people do not need | `note` |
| a grid of tools, then one steps forward | you say the one that actually matters is | `canvas` |
| bars growing, before and after | you compare two numbers out loud | `statbars` |
| arrows walking through the steps | you say first, then, then | `canvas` |
| a line climbing up a chart | you describe growth over time | `chart` |
| an editing timeline scrubbing past | you talk about editing or making the thing | `timeline` |
| the whole background becomes the app | you name the app you are working inside | `uiworld` |
| a DM landing with your keyword in it | you ask people to send you a word | `dm` |
| your keyword typing into a comment box | you ask people to comment a word | `comment` |
| you pop out of the frame | the biggest moment in the reel, once | `framebreak` |
| the camera pulls back to show how it was made | you reveal how the thing was actually done | `pullback` |
| a doodle outline drawn around you | a light or funny aside | `doodle` |
| a zoom-blur jump to the next point | you move on to the next point | `zoomblur` |
| the screen tears like paper | you change topic or location hard | `rip` |
| a glitch cut | a quick switch, usually about tech | `glitch` |
| a flash of light | a jump in time, once in a reel | `flash` |


## Light or dark lettering
A hook (`top`, `behind`, or `bars` with `"bar": "none"`), an end card and a `bigword` with no `colour`
are bare lettering on your footage. White and the punch colour disappear on a bright wall; the dark
brand colour disappears on dark footage. Nobody has to judge this: before it renders, the engine
samples the footage behind each of those, across the whole time it is on screen, and draws it in the
colour that clears the contrast floor. On a dark hook the accent line keeps the punch colour as a
highlight behind the letters, the same move the captions make on a light board. The render log names
the colour it chose and why. `"ink": true` or `"ink": false` on the hook or the end card, or a
`colour` on a bigword, is final and the engine leaves it alone.

## backdrop
B-roll or a screenshot behind you, blur-faded at the bottom, you cut out in front. Use when you mention a place, a product, a page. If it would end just before a cut, it runs on to the cut by itself (so does any full-screen b-roll or graphic), so your face never flashes up for a split second; `"snapBroll": false` at the top of `edit.json` turns that off.

```
{type: 'backdrop'; src: string; kind: 'image' | 'video'; start: number; dur: number; srcIn?: number; height?: number; subjectFront?: boolean; pos?: number}
```

## band
Two shots stacked with a blurred seam (you plus a guest, or you plus a screen). Never a hard split screen.

```
{type: 'band'; src: string; kind: 'image' | 'video'; start: number; dur: number; srcIn?: number; height?: number; shiftMain?: number; pos?: number}
```

## sticker
A cut-out photo with a white outline, dropped on screen. A person, a product, a logo.

```
{type: 'sticker'; src: string; start: number; dur: number; x?: number; y?: number; width?: number; rotate?: number; outline?: boolean; strike?: number}
```

## prompt
A typed prompt bar, like an AI chat box. Use when you say what you asked an AI.

```
{type: 'prompt'; text: string; start: number; dur: number; y?: number; label?: string; files?: string[]}
```

## counter
A number counting up or down. Any time you say a number: hours, dollars, followers.

```
{type: 'counter'; from: number; to: number; start: number; dur: number; format?: 'time' | 'int' | 'money' | 'k'; y?: number; label?: string; size?: number; roll?: boolean}
```

## bigword
One huge word, in front of or behind your head. The punch word in a sentence.
Leave `colour` off and the engine picks white, the punch colour or the dark brand colour by measuring
the footage behind the word. Setting `colour` yourself turns that off.

```
{type: 'bigword'; text: string; start: number; dur: number; y?: number; size?: number; colour?: string; behind?: boolean; letters?: boolean; strike?: number; font?: 'serif' | 'display'}
```

## colourbg
Full brand-colour background with typed lines, you cut out in front. Section titles, big claims.

```
{type: 'colourbg'; colour?: string; start: number; dur: number; lines?: {t: string; f?: 'serif' | 'display'; c?: string; at?: number}[]; y?: number}
```

## dm
`verb` is the word in front of the keyword and `reply` is what the reply bubble says. Leave them out and the engine fills `verb` from `brand/voice.json` (`ask.verbs`). It only falls back to "Comment" when nobody has said how this person asks, and it says so when it does: a buyer who never asks for comments should never see the word.

A DM card: "comment WORD and I will send it". The call to action at the end.

```
{type: 'dm'; keyword: string; text?: string; start: number; dur: number; handle?: string; verb?: string; reply?: string}
```

## wall
A wall of screenshots or thumbnails filling the frame. Proof in volume.

```
{type: 'wall'; srcs: string[]; start: number; dur: number}
```

## chat
A chat conversation building message by message. Showing what you said to AI and what it said back.

```
{type: 'chat'; start: number; dur: number; y?: number; msgs: {from: 'me' | 'ai'; text: string; at: number}[]}
```

## folder
A Finder-style folder with files flying in. "Put them all in one folder."

```
{type: 'folder'; start: number; dur: number; name?: string; srcs: string[]; y?: number}
```

## deck
A deck of images: fanned, snapped, walled or scattered. Several pieces of proof at once.

```
{type: 'deck'; srcs: string[]; start: number; dur: number; mode?: 'fan' | 'snap' | 'wall' | 'scatter'; subjectFront?: boolean; y?: number}
```

## pills
A row of pills with the same text repeating. Lists, tags, "every single one".

```
{type: 'pills'; text: string; count?: number; start: number; dur: number; y?: number}
```

## orbit
Images orbiting around you. Options, tools, people.

```
{type: 'orbit'; srcs: string[]; start: number; dur: number; y?: number; rx?: number; ry?: number; speed?: number}
```

## uiworld
An app UI world around you. "Inside the app."

```
{type: 'uiworld'; start: number; dur: number; text: string; app?: string; colour?: string}
```

## framebreak
You break out of the frame. A reveal.

```
{type: 'framebreak'; start: number; dur: number; scale?: number; bg?: string}
```

## pullback
The camera pulls back to show a to-do list filling. "Then I did this, this, this."

```
{type: 'pullback'; start: number; dur: number; tasks?: {text: string; at: number}[]; title?: string}
```

## vertigo
A dolly-zoom. A realisation moment.

```
{type: 'vertigo'; start: number; dur: number; amount?: number}
```

## dzoom
A slow digital zoom in. Emphasis without an effect.

```
{type: 'dzoom'; start: number; dur: number; scale?: number; focusY?: number}
```

## phone
A phone mockup beside you playing a video or showing a screenshot. Show a reel, a post, an app.

```
{type: 'phone'; src: string; kind: 'image' | 'video'; start: number; dur: number; srcIn?: number; side?: 'left' | 'right'; y?: number; views?: [number, number]; tag?: string}
```

## tasks
A task list ticking off. Steps you did.

```
{type: 'tasks'; start: number; dur: number; title?: string; items: {text: string; at: number}[]; y?: number; x?: number}
```

## chart
A line chart drawing itself. Growth, a drop, a trend.

```
{type: 'chart'; start: number; dur: number; points: number[]; label?: string; y?: number}
```

## paper
A word stamped on paper. Old-school, a verdict.

```
{type: 'paper'; start: number; dur: number; word: string}
```

## doodle
Hand-drawn scribbles around you. Playful emphasis.

```
{type: 'doodle'; start: number; dur: number}
```

## cover
A title card with lines. The cold open.

```
{type: 'cover'; start: number; dur: number; title: string; lines?: string[]}
```

## glass
Text on a frosted glass panel. A quote.

```
{type: 'glass'; start: number; dur: number; text: string; y?: number; size?: number}
```

## rip
The frame tears. A hard transition.

```
{type: 'rip'; start: number; dur?: number}
```

## glitch
A glitch hit. "Wait, what."

```
{type: 'glitch'; start: number; dur?: number}
```

## canvas
A plain colour canvas takes over. Breathing room for text.

```
{type: 'canvas'; start: number; dur: number; colour?: string}
```

## timeline
A timeline bar with markers. "First, then, then."

```
{type: 'timeline'; start: number; dur: number; y?: number}
```

## burn
A word burning on. "This BURNED me."

```
{type: 'burn'; text: string; start: number; dur: number; y?: number; size?: number}
```

## annotate
An arrow with a label pointing at something in frame.

```
{type: 'annotate'; text: string; start: number; dur: number; x: number; y: number; toX: number; toY: number}
```

## receipts
An itemised receipt totting up, with a total and an optional strike-through. Costs.

```
{type: 'receipts'; start: number; dur: number; items: {label: string; price: number}[]; total?: number; strikeAt?: number; y?: number}
```

## spotlight
A row of options with one picked. "Out of all of these, this one."

```
{type: 'spotlight'; start: number; dur: number; items: {label: string; icon?: string}[]; pick?: number; pickAt?: number; y?: number}
```

## statbars
Horizontal stat bars filling. Comparisons.

```
{type: 'statbars'; start: number; dur: number; title?: string; rows: {label: string; value: number}[]; y?: number}
```

## flow
A step-by-step flow diagram. A process.

```
{type: 'flow'; start: number; dur: number; steps: string[]; y?: number}
```

## calendar
A calendar grid filling in days. Consistency, a schedule.

```
{type: 'calendar'; start: number; dur: number; days?: string[]; rows?: number; fill?: number[][]; y?: number; title?: string}
```

## dropdown
A dropdown menu picking an option. A choice.

```
{type: 'dropdown'; start: number; dur: number; label?: string; options: string[]; pick: number; y?: number}
```

## dial
A dial sweeping from one number to another. A rating, a percentage.

```
{type: 'dial'; start: number; dur: number; label?: string; from?: number; to?: number; y?: number}
```

## swatches
Colour swatch cards fanning out. Brand, design, options.

```
{type: 'swatches'; start: number; dur: number; colours?: string[]; y?: number}
```

## note
A notes-app card with items, some struck through. A plan, a list.

```
{type: 'note'; start: number; dur: number; title?: string; items: {text: string; strike?: number}[]; y?: number}
```

## envelope
An envelope opening with a label. An email, an offer, a message.

```
{type: 'envelope'; start: number; dur: number; src?: string; label?: string; y?: number}
```

## header
A headline band across the top. A section header.

```
{type: 'header'; text: string; start: number; dur: number}
```

## comment
A comment card with a keyword and optional follow prompt. The end-card ask.

```
{type: 'comment'; keyword: string; start: number; dur: number; handle?: string; follow?: boolean}
```

## zoomthrough
A zoom through the frame into the next shot.

```
{type: 'zoomthrough'; start: number; dur?: number}
```

## zoomblur
A zoom-blur hit on a beat.

```
{type: 'zoomblur'; start: number; dur?: number}
```

## flash
A white flash on a beat.

```
{type: 'flash'; start: number; dur?: number}
```

## label
A small label with a name or place, blue or black. Every time you say a name.

```
{type: 'label'; text: string; small?: string; start: number; dur: number; y?: number; bg?: 'blue' | 'black'}
```
