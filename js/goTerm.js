CLMSUI = CLMSUI || {};

CLMSUI.GoTerm = function() {
    //this.is_a = new Set(); // i.e. superclasses
    //this.subclasses = new Set();
    //this.part_of = new Set();
    //this.parts = new Set();
    this.interactors = new Set();
}

CLMSUI.GoTerm.prototype.getInteractors = function(interactorSet) {
    var go = CLMSUI.compositeModelInst.get("go");
    if (!interactorSet) {
        interactorSet = new Set();
    }
    if (this.parts) {
        for (let partId of this.parts) {
            go.get(partId).getInteractors(interactorSet);
        }
    }
    if (this.subclasses) {
        for (let subclassId of this.subclasses) {
            go.get(subclassId).getInteractors(interactorSet);
        }
    }
    if (this.interactors) {
        for (let i of this.interactors) {
            if (i.hidden == false) {
              interactorSet.add(i);
            }
        }
    }
    return interactorSet;
}


CLMSUI.GoTerm.prototype.isDirectRelation = function(anotherGoTerm) {
    if (this == anotherGoTerm) {
        return true;
    }
    if (this.is_a && this.is_a.has (anotherGoTerm.id)) {
        return true;
    }
    if (this.subclasses && this.subclasses.has (anotherGoTerm.id)) {
        return true;
    }
    if (this.part_of && this.part_of.has (anotherGoTerm.id)) {
        return true;
    }
    if (this.parts && this.parts.has (anotherGoTerm.id)) {
        return true;
    }
    return false;
}


/*
CLMSUI.GoTerm.prototype.getClosestVisibleParents = function(visibleParents) {
    if (!visibleParents) {
        visibleParents = new Set();
    }
    for (var parent of this.parents) {
        if (parent.isVisible()) {
            visibleParents.add(parent);
        } else {
            parent.getClosestVisibleParents(visibleParents);
        }
    }
    return visibleParents;
}

CLMSUI.GoTerm.prototype.isVisible = function() {
    if (this.parents.length == 0) {
        return true;
    } else {
        for (let p of this.parents) {
            if (p.expanded) {
                return true;
            }
        }
    }
    return false;
}
*/
