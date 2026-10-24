# The b-roll organiser: how the conversation goes

For Claude. The owner says something like "organise my b-roll", "sort my camera roll", "set up my
b-roll albums", or the editor needs footage behind a line and `brand/broll.json` does not exist yet.
Run every command yourself, one question at a time, and say what each step did in one plain sentence.
They are a founder, not a developer. Keep it light: this is a ten minute job, not a project.

The whole idea: a few big buckets, sorted once, so that when a reel says "while I'm working" there
are real clips of them working to choose from instead of a guess. Few buckets is the point. Someone
juggling a business does not want twelve albums to maintain, and the owner of this kit cut her own
list down to four.

## 1. Where does their footage live?

Ask: "Is your footage in the Photos app on this Mac, or in folders (a drive, Dropbox, Google Drive,
your Downloads)?"

- **Photos on a Mac** → Photos mode. Their buckets become albums in Photos, which sync to their
  phone, so they can grab b-roll anywhere.
- **Windows**, or a Mac where the footage is in folders, or they would rather not touch Photos →
  folders mode. You make one folder per bucket and link (or copy) clips into it. The originals never
  move.

## 2. Photos mode: get the helper on

Say: "To read your Photos library I need a small helper. It installs inside the Reel Studio folder,
takes a minute or two, and changes nothing else on your Mac." Then:

    node engine/broll.mjs setup

- If it says macOS will not let it read the library: they need to turn on **Full Disk Access** for
  Claude in System Settings › Privacy & Security, then quit and reopen Claude. Walk them to it. You
  cannot flip that switch for them and should not try.
- It prints the faces they have named in Photos. Ask: "Is one of these you?" If yes, that name is
  `--me`. If not, offer two choices: they name their face in Photos (People, tap their face, Add
  Name, then run setup again), or carry on without it, in which case buckets go on what is in the
  picture only and "Me working" will also catch other people at laptops. Both are fine.
- If they already have b-roll albums (setup lists anything that looks like one), ask whether to use
  those as buckets instead of making new ones. That is `--album <bucket>="Their album"`.

## 3. Pick the buckets

Offer the default and let them change it. Three to five, never a long list:

| id | bucket | what goes in it |
|---|---|---|
| `working` | Me working | them at a laptop, desk, whiteboard, notebook |
| `bts` | Behind the scenes | microphones, cameras, tripods, set-ups, filming days |
| `life` | Life | them out and about: cafes, car, walks, beach, the sky (only them in shot) |
| `clients` | Product and clients | product shots, shop, client sessions (Photos is patchy at this one) |
| `speaking` | Speaking | stage, podium, audience (Photos is poor at this one: they will hand-pick) |

Say it like: "Most people do best with three or four. I'd suggest Me working, Behind the scenes and
Life. Want those, or does your business need a different one, like Product?" Rename to their words
with `--name life="Weekends"`. A bucket of their own needs Photos labels: `--labels kitchen=Food,Kitchen`.

Two more quick ones:
- "Shall I leave out photos of kids?" Yes adds `--kids-out`. If their own children are named in
  Photos, add them with `--leave-out "Name,Name"` too.
- Default is camera clips from 2023 on, videos only. Older footage: `--since 2021-01-01`. Photos too:
  `--media both`.

Then write it:

    node engine/broll.mjs init --mode photos --buckets working,bts,life --me "Their Name" --kids-out

Folders mode also needs where the footage is and, if they like, where the bucket folders go
(default: a `B-roll` folder inside their footage folder). Ask permission before reading a folder.

    node engine/broll.mjs init --mode folders --source "D:\Footage" --buckets working,bts,life

`--copy` makes real copies instead of links. Links cost no disk space but only work on the same
drive; across drives it copies automatically.

## 4. Scan, and show them before anything is written

    node engine/broll.mjs scan

This changes nothing anywhere. In Photos mode it prints a count per bucket and makes a preview sheet
of the newest 24 in each (`brand/broll/preview/<bucket>.png`). **Open every preview and look at
it yourself before you say anything.** Then tell them the counts in one line each and what you saw:
"Me working: 60 clips, nearly all you at the laptop or whiteboard. Behind the scenes: 1,015, mostly
studio set-ups, a lot of it client sessions." If a bucket looks wrong (talking-to-camera takes,
someone else's kids, the wrong kind of thing), say so and fix it before building: change its labels
with `init --force …` and scan again. A bucket marked as one Photos is not good at needs your eyes
most.

In folders mode there are no labels, so you do the sorting by eye:

    node engine/broll.mjs sheets           # numbered sheets of everything not sorted yet
    node engine/broll.mjs sort working 1 4 7-12
    node engine/broll.mjs sort none 2 3    # not b-roll: stops showing up on the sheets

Look at each sheet, sort what you are sure of, and ask them about anything you are not ("13 to 15
look like a client's office, is that Product and clients?"). Numbers stay the same between runs.

## 5. Build, only after a yes

    node engine/broll.mjs build            # without --yes: says exactly what it would do, then stops

Read that back to them in plain words ("I'll make three albums in Photos called B-roll: Me working
(60), B-roll: Behind the scenes (1,015) and B-roll: Life (354). Nothing gets moved or deleted.
Go ahead?"). On a clear yes:

    node engine/broll.mjs build --yes

The first time, macOS asks to let Claude control Photos. Tell them before it pops up: they click OK.
Build only ever adds. It never removes anything from an album or deletes a file, and running it
again later just adds the new footage.

## 6. Close

Tell them in two sentences how it gets used: when a reel has a line that wants footage behind it,
you look in these buckets, bring in a few real clips and show them, and they pick. To refresh after
a few months of new footage, they just say "update my b-roll" and you run scan, then build after
their yes. They can also add clips to an album or folder by hand any time; the editor reads
whatever is in there.

`node engine/broll.mjs status` shows the set-up in plain words whenever you need it.
