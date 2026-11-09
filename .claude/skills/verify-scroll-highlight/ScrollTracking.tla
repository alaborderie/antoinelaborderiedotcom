--------------------------- MODULE ScrollTracking ---------------------------
(***************************************************************************)
(* The "which part of the page am I reading" highlight of static/main.js. *)
(*                                                                         *)
(* Two IntersectionObservers pick the highlighted section:                 *)
(*  - stageObserver (main.js:59-88): Selected work stages, rootMargin       *)
(*    "-18% 0px -45%", thresholds [0, 0.2, 0.5]; sets aria-current         *)
(*    ="location" on the matching [data-stage-link] and the stage meter.    *)
(*  - sectionObserver (main.js:39-54): [data-scene] sections, rootMargin    *)
(*    "-30% 0px -45%", thresholds [0, 0.25, 0.5]; sets                      *)
(*    body[data-active-scene] and --scene.                                  *)
(* Both callbacks do the same thing with the entries they receive:         *)
(*   visible = entries.filter(isIntersecting).sort(by ratio desc)[0];       *)
(*   if (!visible) return;  highlight = visible.target                      *)
(* An entry exists only for a target whose (isIntersecting, threshold      *)
(* index) changed since the last notification (W3C IntersectionObserver,   *)
(* "run the update intersection observations steps").                      *)
(*                                                                         *)
(* Scroll positions are abstracted to the ordered list of "zones" where    *)
(* every target keeps the same (isIntersecting, threshold index). The zone *)
(* lists below come from the layout measured in Chromium at 1280x800 on    *)
(* commit 7b125e4 (see SKILL.md); each target is "out" (not in the band),   *)
(* "low" (in the band, ratio below the middle threshold) or "high".        *)
(*                                                                         *)
(* One step = one rendering update that moves the page by at most one zone,*)
(* immediately followed by the observer callback for that update.         *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANT Observer   \* "stage", "stage2" (first two stages) or "scene"

None == "none"

\* Stages: peaksys 863 px, hellowork 834 px, royalcanin 834 px tall, 64 px apart; band 296 px.
\* Entering stage B while A still has 232 px (>= 0.2 * 863) in the band, A drops under 0.2
\* 59 px later, B passes 0.2 at 167 px: the zones below, in scroll order.
StageTargets == <<"peaksys", "hellowork", "royalcanin">>
StageZones == <<
    [peaksys |-> "out",  hellowork |-> "out",  royalcanin |-> "out"],
    [peaksys |-> "low",  hellowork |-> "out",  royalcanin |-> "out"],
    [peaksys |-> "high", hellowork |-> "out",  royalcanin |-> "out"],
    [peaksys |-> "high", hellowork |-> "low",  royalcanin |-> "out"],
    [peaksys |-> "low",  hellowork |-> "low",  royalcanin |-> "out"],
    [peaksys |-> "low",  hellowork |-> "high", royalcanin |-> "out"],
    [peaksys |-> "out",  hellowork |-> "high", royalcanin |-> "out"],
    [peaksys |-> "out",  hellowork |-> "high", royalcanin |-> "low"],
    [peaksys |-> "out",  hellowork |-> "low",  royalcanin |-> "low"],
    [peaksys |-> "out",  hellowork |-> "low",  royalcanin |-> "high"],
    [peaksys |-> "out",  hellowork |-> "out",  royalcanin |-> "high"],
    [peaksys |-> "out",  hellowork |-> "out",  royalcanin |-> "low"],
    [peaksys |-> "out",  hellowork |-> "out",  royalcanin |-> "out"] >>

\* The first two stages only, for a chart small enough to read (same geometry).
Stage2Targets == <<"peaksys", "hellowork">>
Stage2Zones == <<
    [peaksys |-> "out",  hellowork |-> "out"],
    [peaksys |-> "low",  hellowork |-> "out"],
    [peaksys |-> "high", hellowork |-> "out"],
    [peaksys |-> "high", hellowork |-> "low"],
    [peaksys |-> "low",  hellowork |-> "low"],
    [peaksys |-> "low",  hellowork |-> "high"],
    [peaksys |-> "out",  hellowork |-> "high"] >>

\* Scenes: every section is taller than the 200 px band, so no ratio reaches 0.25:
\* a section is only ever "out" or "low". Three consecutive scenes, no gap.
SceneTargets == <<"capability", "work", "lab">>
SceneZones == <<
    [capability |-> "low", work |-> "out", lab |-> "out"],
    [capability |-> "low", work |-> "low", lab |-> "out"],
    [capability |-> "out", work |-> "low", lab |-> "out"],
    [capability |-> "out", work |-> "low", lab |-> "low"],
    [capability |-> "out", work |-> "out", lab |-> "low"] >>

Targets == CASE Observer = "stage" -> StageTargets [] Observer = "stage2" -> Stage2Targets
             [] Observer = "scene" -> SceneTargets
Zones   == CASE Observer = "stage" -> StageZones [] Observer = "stage2" -> Stage2Zones
             [] Observer = "scene" -> SceneZones
T == {Targets[i] : i \in 1..Len(Targets)}
Order(t) == CHOOSE i \in 1..Len(Targets) : Targets[i] = t
Rank(s) == IF s = "high" THEN 2 ELSE IF s = "low" THEN 1 ELSE 0

VARIABLES zone, lit, was, moved
vars == <<zone, lit, was, moved>>

InBand(z) == {t \in T : Zones[z][t] # "out"}

\* The callback on a batch of entries for targets E, read in zone z.
\* sort(by ratio desc)[0]: a "high" entry beats a "low" one; between two entries of the
\* same rank the model lets either win (their exact ratios are not modeled).
Pick(E, z, old) ==
    LET vis == {t \in E : Zones[z][t] # "out"}
    IN IF vis = {} THEN {old}
       ELSE {t \in vis : \A u \in vis : Rank(Zones[z][u]) <= Rank(Zones[z][t])}

\* observe() delivers a first entry for every target (page load or restored scroll position).
Init ==
    /\ zone \in 1..Len(Zones)
    /\ lit \in Pick(T, zone, None)
    /\ was = lit
    /\ moved = "load"

Changed(z1, z2) == {t \in T : Zones[z1][t] # Zones[z2][t]}

\* Written out (not via a shared operator) so that TLC names each step after its action.
YouScrollDown ==
    /\ zone + 1 \in 1..Len(Zones)
    /\ zone' = zone + 1
    /\ lit' \in Pick(Changed(zone, zone + 1), zone + 1, lit)
    /\ was' = lit
    /\ moved' = "down"
YouScrollUp ==
    /\ zone - 1 \in 1..Len(Zones)
    /\ zone' = zone - 1
    /\ lit' \in Pick(Changed(zone, zone - 1), zone - 1, lit)
    /\ was' = lit
    /\ moved' = "up"

Next == YouScrollDown \/ YouScrollUp

Spec == Init /\ [][Next]_vars

TypeOK == zone \in 1..Len(Zones) /\ lit \in T \cup {None} /\ was \in T \cup {None}

\* While some section is in the reading band, the highlighted section is one of them.
HighlightIsOnScreen == InBand(zone) # {} => lit \in InBand(zone)
\* Scrolling down never moves the highlight back to an earlier section, nor up to a later one.
HighlightNeverGoesBack ==
    (lit # was /\ lit # None /\ was # None) =>
        \/ moved = "down" /\ Order(lit) > Order(was)
        \/ moved = "up" /\ Order(lit) < Order(was)
=============================================================================
