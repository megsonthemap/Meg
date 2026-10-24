# Optional: the review page from anywhere

The review studio that ships with this kit runs on your Mac and is reachable from any phone on the
same Wi-Fi. That covers reviewing on the couch. It does not cover reviewing on the train, because
nothing is uploaded anywhere.

If you want that, the same page can be published privately to your own Claude account, where it keeps
its reels in Claude's artifact database and streams the previews from Claude's asset store. Then it
opens anywhere you are signed in to Claude.

**It needs a Claude Code that can publish artifacts.** Not every Claude plan and app version can, and
the kit cannot install that. Ask Claude: *"can you publish an artifact with the db, user and assets
capabilities?"* If the answer is no, stay on the local studio; nothing is missing from the review
experience itself.

## If it can

There is one page in this kit, `review/index.html`, and this turns it into an artifact rather than
replacing it. Ask Claude:

> Take `review/index.html` and publish it as a private artifact called "Reel Review" with the db,
> user and assets capabilities, swapping its `/api/...` calls for the artifact database and keeping
> everything else, including the version menu. Then, every time you publish a cut, also upload
> `review/media/<slug>-v<n>.mp4` to that artifact's asset store and write the reel document to the
> artifact database: `reels/<slug>` with the fields from `review/data/<slug>.json` (the `video` of
> each version becomes the uploaded asset's URL), and read my notes back from `reels/<slug>/notes`
> instead of the notes file. Keep the local studio working as well.

Two things to know:

- The page lives in your own Claude account. Nothing is shared with anyone.
- Previews are 720p so they load on mobile data. Full-resolution files still go to `~/Downloads/Reels`.
