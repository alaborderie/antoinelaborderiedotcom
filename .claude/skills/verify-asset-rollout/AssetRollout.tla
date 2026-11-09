---------------------------- MODULE AssetRollout ----------------------------
(***************************************************************************)
(* One visitor's browser across one release of antoinelaborderie.com.      *)
(*                                                                         *)
(* Release 1 is live; release 2 ships a different static/styles.css.       *)
(* Every step below is ONE HTTP exchange (atomic in the code: a stateless  *)
(* handler answers it), ONE cache expiry in the browser, or ONE change of  *)
(* which pods Traefik sends traffic to.                                    *)
(*                                                                         *)
(* Code facts at repo commit 7b125e4 (src/main.rs):                        *)
(*  - english()/french() render index.html, which links                    *)
(*    /static/styles.css?v={ASSET_VERSION} (templates/index.html:21,54).    *)
(*  - nest_service("/static", ServeDir::new("static")) serves the file on  *)
(*    disk and ignores ?v= (main.rs:87-90): ServerChecksVersion = FALSE.   *)
(*  - http_policy: static 2xx => "public, max-age=86400", pages =>         *)
(*    "public, max-age=300" (main.rs:127-138).                              *)
(* Infra facts (k3s-ovh-config/landing-website.yaml @ fb50d13, outside the *)
(* repo): replicas 1, default RollingUpdate (maxSurge 1, maxUnavailable 0),*)
(* no readinessProbe; CI runs `kubectl rollout restart` (rust.yml:62).     *)
(* => for a moment both pods are endpoints: Overlap = TRUE.               *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
    Overlap,             \* TRUE: old and new pod both receive traffic during the rollout
    Bumped,              \* TRUE: release 2 changes ASSET_VERSION (main.rs:16)
    ServerChecksVersion  \* TRUE: a /static request whose ?v= is not this pod's ASSET_VERSION gets 404 no-store

Releases == {1, 2}
\* The ?v= value that release r writes into its pages.
Key(r) == IF r = 2 /\ ~Bumped THEN 1 ELSE r
Keys == {Key(r) : r \in Releases}

None    == 0   \* nothing cached / no page yet
Waiting == 0   \* the page's stylesheet has not arrived yet
NoCss   == 3   \* the stylesheet request failed (404)

VARIABLES
    live,       \* releases whose pod currently receives traffic from Traefik
    htmlCache,  \* release of the home page in the browser cache (fresh for 300 s), or None
    cssCache,   \* [?v= key -> release whose styles.css the browser stored under that URL (86400 s)]
    page,       \* release of the page on screen, or None
    styled      \* release of the CSS applied to that page, Waiting, or NoCss

vars == <<live, htmlCache, cssCache, page, styled>>

TypeOK ==
    /\ live \in {{1}, {1, 2}, {2}}
    /\ htmlCache \in {None} \cup Releases
    /\ cssCache \in [Keys -> {None} \cup Releases]
    /\ page \in {None} \cup Releases
    /\ styled \in {Waiting, NoCss} \cup Releases

Init ==
    /\ live = {1}
    /\ htmlCache = None
    /\ cssCache = [k \in Keys |-> None]
    /\ page = None
    /\ styled = Waiting

(* ---- the rollout (kubectl rollout restart deployment landing-website) ---- *)
NewPodReady ==            \* new pod joins the endpoints before the old one leaves
    /\ Overlap /\ live = {1} /\ live' = {1, 2}
    /\ UNCHANGED <<htmlCache, cssCache, page, styled>>
OldPodRemoved ==
    /\ live = {1, 2} /\ live' = {2}
    /\ UNCHANGED <<htmlCache, cssCache, page, styled>>
InstantSwitch ==          \* the best case: no moment with both pods
    /\ ~Overlap /\ live = {1} /\ live' = {2}
    /\ UNCHANGED <<htmlCache, cssCache, page, styled>>

(* ---- the visitor's browser (RFC 9111 private cache keyed by full URL) ---- *)
YouOpenPageFromCache ==   \* GET / answered by the browser cache (< 300 s old)
    /\ htmlCache # None
    /\ page' = htmlCache /\ styled' = Waiting
    /\ UNCHANGED <<live, htmlCache, cssCache>>
YouOpenPageFromServer ==  \* GET / answered by one live pod: english() at that pod's release
    /\ htmlCache = None
    /\ \E r \in live : page' = r /\ htmlCache' = r
    /\ styled' = Waiting
    /\ UNCHANGED <<live, cssCache>>
CssFromCache ==           \* GET /static/styles.css?v=Key(page) answered by the browser cache
    /\ page # None /\ styled = Waiting
    /\ cssCache[Key(page)] # None
    /\ styled' = cssCache[Key(page)]
    /\ UNCHANGED <<live, htmlCache, cssCache, page>>
CssFromServer ==          \* the same GET answered by one live pod (ServeDir)
    /\ page # None /\ styled = Waiting
    /\ cssCache[Key(page)] = None
    /\ \E r \in live :
         IF ServerChecksVersion /\ Key(r) # Key(page)
         THEN /\ styled' = NoCss                 \* 404, Cache-Control: no-store
              /\ UNCHANGED cssCache
         ELSE /\ styled' = r                     \* 200, public, max-age=86400
              /\ cssCache' = [cssCache EXCEPT ![Key(page)] = r]
    /\ UNCHANGED <<live, htmlCache, page>>
PageExpires ==            \* 300 s pass
    /\ htmlCache # None /\ htmlCache' = None
    /\ UNCHANGED <<live, cssCache, page, styled>>
CssExpires ==             \* 86400 s pass for one stored stylesheet
    /\ \E k \in Keys : cssCache[k] # None /\ cssCache' = [cssCache EXCEPT ![k] = None]
    /\ UNCHANGED <<live, htmlCache, page, styled>>

Next ==
    \/ NewPodReady \/ OldPodRemoved \/ InstantSwitch
    \/ YouOpenPageFromCache \/ YouOpenPageFromServer
    \/ CssFromCache \/ CssFromServer
    \/ PageExpires \/ CssExpires

Spec == Init /\ [][Next]_vars

(* ---- the rules the reader agrees to ---- *)
\* The page you see is styled by the CSS of its own release.
PageMatchesItsCss == styled \in Releases => styled = page
\* The browser never keeps another release's CSS under the URL the new release links to
\* (that copy would be reused by every new page for 24 h).
NewLinkNeverHoldsOldCss ==
    (2 \in live /\ cssCache[Key(2)] \in Releases) => cssCache[Key(2)] = 2
\* A page's stylesheet link never fails.
CssLinkNeverFails == styled # NoCss
=============================================================================
