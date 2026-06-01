# `jejak fetch`

Pull your teammates' captured traces from `origin` and merge them into your local
[shadow branch](concepts/shadow-branch.md).

```console
$ jejak fetch
merged origin's traces into your local ref
```

Depending on what's changed, you'll see one of: `fetched origin's traces (first sync)`,
`fast-forwarded to origin's traces`, `merged origin's traces into your local ref`,
`already up to date with origin`, or `origin has no traces yet`.

The [merge](concepts/sharing.md) runs entirely with git plumbing — the shadow ref is never checked
out, so your working tree and current branch are untouched. After fetching, [`jejak log --all`](log.md)
shows everyone's sessions and [`jejak status`](status.md) reports how you compare to origin.

## See also

- [`jejak push`](push.md) · [`jejak log`](log.md) · [Sharing traces](concepts/sharing.md)
