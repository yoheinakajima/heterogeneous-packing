#!/usr/bin/env python3
"""Push heterogeneous-packing to GitHub via the API: HEAD tree -> main, _site -> gh-pages."""
import base64, json, os, subprocess, sys, time, urllib.request, urllib.error, http.client

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request

API = "https://api.github.com"
OWNER, REPO = "yoheinakajima", "heterogeneous-packing"
ROOT = os.path.expanduser("~/workspace/research/heterogeneous-packing")


def api(method, path, payload=None, ctx=""):
    attempt = 0
    while True:
     req = urllib.request.Request(API + path, data=json.dumps(payload).encode() if payload is not None else None,
                                 method=method, headers={"Accept": "application/vnd.github+json",
                                                         "Content-Type": "application/json"})
     add_surrogate_to_request(req, "custom.github", allowed_hosts=["api.github.com"])
     try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read()
            return json.loads(body) if body else {}
     except urllib.error.HTTPError as e:
        print("API FAIL", method, path, e.code, ctx, file=sys.stderr)
        print(e.read()[:400].decode(), file=sys.stderr)
        raise
     except (urllib.error.URLError, http.client.RemoteDisconnected, ConnectionResetError) as e:
        if attempt < 4:
            wait = 2 ** attempt
            print(f"transient {type(e).__name__}, retrying in {wait}s (attempt {attempt + 1})", flush=True)
            time.sleep(wait)
            attempt += 1
            continue
        raise


def sh(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=True).stdout


def blob_for(base, path):
    with open(os.path.join(base, path), "rb") as f:
        data = f.read()
    payload = {"content": base64.b64encode(data).decode(), "encoding": "base64"}
    for attempt in range(4):
        try:
            b = api("POST", f"/repos/{OWNER}/{REPO}/git/blobs", payload, ctx=path)
            return b["sha"]
        except urllib.error.HTTPError as e:
            if e.code == 400 and attempt < 3:
                wait = 2 ** attempt
                print(f"  blob 400 for {path}, retrying in {wait}s", flush=True)
                time.sleep(wait)
                continue
            raise


def push_tree(base, ref, message, paths, parents):
    entries = []
    for i, p in enumerate(paths):
        try:
            sha = blob_for(base, p)
        except Exception:
            print(f"blob failed for: {p!r}", flush=True)
            raise
        entries.append({"path": p, "mode": "100644", "type": "blob", "sha": sha})
        if (i + 1) % 50 == 0:
            print(f"  blobs {i + 1}/{len(paths)}", flush=True)
    tree = api("POST", f"/repos/{OWNER}/{REPO}/git/trees", {"tree": entries})["sha"]
    commit = api("POST", f"/repos/{OWNER}/{REPO}/git/commits",
                 {"message": message, "tree": tree, "parents": parents})["sha"]
    try:
        api("POST", f"/repos/{OWNER}/{REPO}/git/refs", {"ref": f"refs/heads/{ref}", "sha": commit})
    except Exception:
        api("GET", f"/repos/{OWNER}/{REPO}/git/refs/heads/{ref}")
        api("PATCH", f"/repos/{OWNER}/{REPO}/git/refs/heads/{ref}", {"sha": commit, "force": True})
    return commit


def main():
    which = sys.argv[1]
    if which == "main":
        # diff vs remote main SHA before pushing (standing rule)
        remote = api("GET", "/repos/%s/%s/git/refs/heads/main" % (OWNER, REPO))
        remote_sha = remote["object"]["sha"]
        base_tree = api("GET", "/repos/%s/%s/git/commits/%s" % (OWNER, REPO, remote_sha))["tree"]["sha"]
        print("remote main:", remote_sha[:10])
        files = sh("git", "ls-tree", "-r", "HEAD", "--name-only").splitlines()
        files = [f for f in files if f and not f.startswith(".git/")]
        print(f"pushing {len(files)} files to main")
        entries = []
        for i, p in enumerate(files):
            try:
                sha = blob_for(ROOT, p)
            except Exception:
                print(f"blob failed for: {p!r}", flush=True)
                raise
            entries.append({"path": p, "mode": "100644", "type": "blob", "sha": sha})
            if (i + 1) % 50 == 0:
                print(f"  blobs {i + 1}/{len(files)}", flush=True)
        tree = api("POST", "/repos/%s/%s/git/trees" % (OWNER, REPO),
                   {"base_tree": base_tree, "tree": entries})["sha"]
        commit = api("POST", "/repos/%s/%s/git/commits" % (OWNER, REPO),
                     {"message": "heterogeneous-packing: open-source hardening study",
                      "tree": tree, "parents": [remote_sha]})["sha"]
        api("PATCH", "/repos/%s/%s/git/refs/heads/main" % (OWNER, REPO),
            {"sha": commit})  # fast-forward; fails loudly if remote moved
        print("main:", commit)
    elif which == "pages":
        sitedir = os.path.join(ROOT, "_site")
        files = []
        for dp, _, fns in os.walk(sitedir):
            for fn in fns:
                files.append(os.path.relpath(os.path.join(dp, fn), sitedir))
        print(f"pushing {len(files)} site files to gh-pages")
        c = push_tree(sitedir, "gh-pages", "site build", files, [])
        print("gh-pages:", c)


main()
