var CLMSUI = CLMSUI || {};

CLMSUI.modelUtils = {
    flattenMatchesOld: function (matchesArr) {
        return matchesArr.map (function(m) { return m.score; });    
    },
    
    flattenMatches: function (matchesArr) {
        var arrs = [[],[]];
        matchesArr.forEach (function(m) { 
            arrs[m.is_decoy? 1 : 0].push (m.score);
        });
        return arrs;
        /*
        return matchesArr
            .filter (function (m) { 
                //return m.crossLinks[0].some (function(c) {
                    var pLink = m.crossLinks[0].proteinLink;
                    return pLink.toProtein.isDecoy() && pLink.fromProtein.isDecoy();
                //});
                
            })
            .map (function(m) { return m.score; })
        ;    
        */
    },
    
    // lots of scores, what's the extent (min and max values)?
    getScoreExtent: function (matchesArr) {
        return d3.extent (Array.from(matchesArr.values()).map (function(d) { return d.score; }));
    },
     
    // letters from http://www.hgmd.cf.ac.uk/docs/cd_amino.html
    // the four 'nh ester' amino acids
    // lys = k, ser = s, thr = t, tyr = y
    esterMap: {"K": true, "S": true, "T": true, "Y": true},
    esterBool: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('').map (function(n) { return {"K": true, "S": true, "T": true, "Y": true}[n]; }),
        
    getEsterLinkType: function (crossLink) {
        var toResIndex = crossLink.toResidue;
        var fromResIndex = crossLink.fromResidue;
        //console.log ("res", crossLink);
        //~ var pLink = crossLink.proteinLink;
        //var pLinkId = pLink.id;
        
        // might need to query protein model at this point if from and to prot data stops getting attached to residues
        
        var fromProt = crossLink.fromProtein;
        var toProt = crossLink.toProtein;
        
        var fromResType = this.getResidueType (fromProt, fromResIndex);
        var toResType = this.getResidueType (toProt, toResIndex);
        
        // http://jsperf.com/letter-match says using a boolean array for the letter values is generally quickest, have a poke if you disagree
        var fromEster = this.esterBool[fromResType.charCodeAt(0) - 65]; //this.esterMap[fromResType];
        var toEster = this.esterBool[toResType.charCodeAt(0) - 65]; //this.esterMap[toResType];
        
        return (fromEster ? 1 : 0) + (toEster ? 1 : 0);
        
    },
        
    getResidueType: function (protein, resIndex, seqAlignFunc) {
        var seq = protein.sequence;
        // Some sequence alignment stuff can be done if you pass in a func
        resIndex = seqAlignFunc ? seqAlignFunc (resIndex) : resIndex;
        // Is the sequence starting at 1, do the resIndex's start at 1?
        return seq[resIndex - 1];
    },
    
    getDirectionalResidueType: function (xlink, getTo, seqAlignFunc) {
        return CLMSUI.modelUtils.getResidueType (getTo ? xlink.toProtein : xlink.fromProtein, getTo ? xlink.toResidue : xlink.fromResidue, seqAlignFunc);   
    },
    
    makeTooltipContents: {
        link: function (xlink) {
            return [
                ["From", xlink.fromResidue, CLMSUI.modelUtils.amino1to3Map [CLMSUI.modelUtils.getDirectionalResidueType(xlink, false)], xlink.fromProtein.name],
                ["To", xlink.toResidue, CLMSUI.modelUtils.amino1to3Map [CLMSUI.modelUtils.getDirectionalResidueType(xlink, true)], xlink.toProtein.name],
                ["Matches", xlink.filteredMatches_pp.length],
            ];
        },
        
        interactor: function (interactor) {
             return [["ID", interactor.id], ["Accession", interactor.accession], ["Size", interactor.size], ["Desc.", interactor.description]];
        },
        
        multilinks: function (xlinks, interactorId, residueIndex) {
            var ttinfo = xlinks.map (function (xlink) {
                var startIsTo = (xlink.toProtein.id === interactorId && xlink.toResidue === residueIndex);
                var threeLetterCode = CLMSUI.modelUtils.amino1to3Map [CLMSUI.modelUtils.getDirectionalResidueType(xlink, !startIsTo)];
                if (startIsTo) {
                    return [xlink.fromResidue, threeLetterCode, xlink.fromProtein.name, xlink.filteredMatches_pp.length]; 
                } else {
                    return [xlink.toResidue, threeLetterCode, xlink.toProtein.name, xlink.filteredMatches_pp.length];
                }
            });
            var sortFields = [3, 0]; // sort by matches, then res index
            var sortDirs = [1, -1];
            ttinfo.sort (function(a, b) { 
                var diff = 0;
                for (var s = 0; s < sortFields.length && diff === 0; s++) {
                    var field = sortFields[s];
                    diff = (b[field] - a[field]) * sortDirs[s]; 
                }
                return diff;
            });
            ttinfo.unshift (["Pos", "Residue", "Protein", "Matches"]);
            return ttinfo;
        },
        
        feature: function (feature) {
             return [["Name", feature.name], ["Type", feature.category], ["Start", feature.fstart], ["End", feature.fend]];
        },
    },
    
    makeTooltipTitle: {
        residue: function (interactor, residueIndex, residueExtraInfo) {
            return residueIndex + "" + (residueExtraInfo ? residueExtraInfo : "") + " " + 
                CLMSUI.modelUtils.amino1to3Map [CLMSUI.modelUtils.getResidueType (interactor, residueIndex)] + " " + interactor.name;
        },    
        link: function () { return "Linked Residue Pair"; },   
        interactor: function (interactor) { return interactor.name.replace("_", " "); }, 
        feature: function () { return "Feature"; },
    },
     
    findResidueIDsInSquare : function (fromProtID, toProtID, crossLinkMap, sr1, er1, sr2, er2) {
        var a = [];
        for (var n = sr1; n <= er1; n++) {
            for (var m = sr2; m <= er2; m++) {
                var k = fromProtID+"_"+n+"-"+toProtID+"_"+m;
                var crossLink = crossLinkMap.get(k);
                if (crossLink) {
                    a.push (crossLink);
                }
            }
        }
        return a;
    },
    
    findResidueIDsInSpiral : function (fromProtID, toProtID, crossLinkMap, cx, cy, side) {
        var a = [];
        var x = cx;
        var y = cy;
        var moves = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        var b = 1;
        for (var n = 0; n < side; n++) {
    
            for (var m = 0; m < moves.length; m++) {
                for (var l = 0; l < b; l++) {
                    var k = fromProtID+"_"+x+"-"+toProtID+"_"+y;
                    var crossLink = crossLinkMap.get(k);
                    if (crossLink) {
                        a.push (crossLink);
                    }
                    //console.log ("["+x+", "+y+"]");    
                    x += moves[m][0];
                    y += moves[m][1];
                }
                if (m == 1) {
                    b++;
                }
            }
            b++;
        }
        // tidy up last leg of spiral
        for (var n = 0; n < b; n++) {
            var k = fromProtID+"_"+x+"-"+toProtID+"_"+y;
            var crossLink = crossLinkMap.get(k);
            if (crossLink) {
                a.push (crossLink);
            }
            //console.log ("["+x+", "+y+"]");    
            x += moves[0][0];
            y += moves[0][1];
        }
        return a;
    },
    
    amino3to1Map: {
         "Ala": "A",
        "Asx": "B",
        "Cys": "C",
        "Asp": "D",
        "Glu": "E",
        "Phe": "F",
        "Gly": "G",
        "His": "H",
        "Ile": "I",
        "Lys": "K",
        "Leu": "L",
        "Met": "M",
        "Asn": "N",
        "Pro": "P",
        "Gln": "Q",
        "Arg": "R",
        "Ser": "S",
        "Thr": "T",
        "Val": "V",
        "Trp": "W",
        "Tyr": "Y",
        "Glx": "Z",
        "ALA": "A",
        "ASX": "B",
        "CYS": "C",
        "ASP": "D",
        "GLU": "E",
        "PHE": "F",
        "GLY": "G",
        "HIS": "H",
        "ILE": "I",
        "LYS": "K",
        "LEU": "L",
        "MET": "M",
        "ASN": "N",
        "PRO": "P",
        "GLN": "Q",
        "ARG": "R",
        "SER": "S",
        "THR": "T",
        "VAL": "V",
        "TRP": "W",
        "X": "X",
        "TYR": "Y",
        "GLX": "Z",
        "*": "*" ,
    },
    
    getSequencesFromNGLModelNew: function (stage) {
        var sequences = [];
        
        stage.eachComponent (function (comp) {    
            comp.structure.eachChain (function (c) {
                console.log ("chain", c, c.residueCount, c.residueOffset, c.chainname);
                if (c.residueCount > 10) {    // short chains are ions/water molecules, ignore
                    var resList = [];
                    c.eachResidue (function (r) {
                        resList.push (CLMSUI.modelUtils.amino3to1Map[r.resname] || "X");    
                    });
                    sequences.push ({chainName: c.chainname, chainIndex: c.index, residueOffset: c.residueOffset, data: resList.join("")});
                }
            });
        });  

        return sequences;
    },
    
    /* Fallback protein-to-pdb chain matching routines for when we don't have a pdbcode to query 
    the pdb web services or it's offline. 
    */
    matchSequencesToProteins: function (sequenceObjs, proteins, extractFunc) {
        proteins = proteins.filter (function (protein) { return !protein.is_decoy; });
        var alignCollection = CLMSUI.compositeModelInst.get("alignColl");
        var matchMatrix = {};
        proteins.forEach (function (prot) {
            //console.log ("prot", prot);
            var protAlignModel = alignCollection.get(prot.id);
            if (protAlignModel) {
                var seqs = extractFunc ? sequenceObjs.map (extractFunc) : sequenceObjs;
                //protAlignModel.set("semiLocal", true);  // needs to be done as initialisation not called on model (figure out why later)
                var alignResults = protAlignModel.alignWithoutStoring (seqs, {semiLocal: true});
                console.log ("alignResults", alignResults);
                var scores = alignResults.map (function (indRes) { return indRes.res[0]; });
                matchMatrix[prot.id] = scores;
            }   
        });
        console.log ("matchMatrix", matchMatrix);
        return CLMSUI.modelUtils.matrixPairings (matchMatrix, sequenceObjs);
    },
    
    matrixPairings: function (matrix, sequenceObjs) {
        var keys = d3.keys(matrix);
        var pairings = [];
        for (var n = 0; n < sequenceObjs.length; n++) {
            var max = {key: undefined, seqObj: undefined, score: 40};
            keys.forEach (function (key) {
                var score = matrix[key][n];
                console.log ("s", n, score, score / sequenceObjs[n].data.length);
                if (score > max.score && (score / sequenceObjs[n].data.length) > 1) {
                    max.score = score;
                    max.key = key;
                    max.seqObj = sequenceObjs[n];
                }
            });
            if (max.key) {
                pairings.push ({id: max.key, seqObj: max.seqObj});
            }
        }
        
        return pairings;
    },
    
    aggregateCrossLinkFilteredMatches: function (xlinkarr) {
        var nestedArr = xlinkarr.map (function (xlink) {
            return xlink.filteredMatches_pp;
        });
        return [].concat.apply([], nestedArr);
    },
    
    getRandomSearchId : function (clmsModel, match) {
        var searchId = match.searchId;
        var searchMap = clmsModel.get("searches");
        var searchData = searchMap.get(searchId);
        var randId = searchData.randId;    
        return randId;
    },
    
    isReverseProtein: function (prot1, prot2) {
        return ((prot1.name === "REV_"+prot2.name || "REV_"+prot1.name === prot2.name) && (prot1.accession === "REV_"+prot2.accession || "REV_"+prot1.accession === prot2.accession) && (prot1.is_decoy ^ prot2.is_decoy));
    },
    
    isIntraLink: function (crossLink) {
         return ((crossLink.toProtein.id === crossLink.fromProtein.id) || CLMSUI.modelUtils.isReverseProtein (crossLink.toProtein, crossLink.fromProtein));
    },
    
    getAlignmentsAsFeatures: function (protID, alignCollection, includeCanonical) {
        var alignModel = alignCollection.get(protID);
        if (alignModel) {
            return alignModel.get("seqCollection").models
                .map (function (seqModel) {
                    var alignment = seqModel.get("compAlignment");
                    return {start: 1, end: alignment.convertToRef.length, name: alignment.label, protID: protID, id: protID+" "+alignment.label, category: "Alignment", alignmentID: seqModel.get("compID") };
                })
                .filter(function (alignFeature) {
                    return includeCanonical || alignFeature.name !== "Canonical";     
                })
            ;
        }
        return [];
    },
    
    intersectObjectArrays: function (a, b, compFunc) {
        if (a && b && a.length && b.length && compFunc) {
            var map = d3.map (a, compFunc);
            var result = b.filter (function (elem) {
                return map.has (compFunc(elem));
            });
            return result;                    
        }
        return [];
    },
    
    getPDBIDsForProteins: function (interactorMap, success) {
        var ids = Array.from(interactorMap.values())
            .filter (function (prot) { return !prot.is_decoy; })
            .map (function(prot) { return prot.accession; })
        ;
        
        var xmlString = "<orgPdbQuery><queryType>org.pdb.query.simple.UpAccessionIdQuery</queryType>"
            +"<description>PDB Query Using Uniprot IDs</description><accessionIdList>"
            +ids.join(",")
            +"</accessionIdList></orgPdbQuery>"
        ;
        
        var encodedXmlString = encodeURIComponent (xmlString);
        
        $.post("http://www.rcsb.org/pdb/rest/search/?req=browser&sortfield=Release Date", encodedXmlString, success);
    },
    
    loadUserFile: function (fileObj, successFunc) {
       if (window.File && window.FileReader && window.FileList && window.Blob) {
           var reader = new FileReader();

          // Closure to capture the file information.
          reader.onload = (function() {
            return function(e) {
                successFunc (e.target.result);
            };
          })(fileObj);

          // Read in the image file as a data URL.
          reader.readAsText(fileObj);
       }
    },
    
    make3DAlignID : function (baseID, chainName, chainIndex) {
        return baseID + ":" + chainName + ":" + chainIndex;
    },
    
    pickCommonPDB: function (interactors) {
        var protMap = {
            "1AO6": ["P02768-A"],
            "3NBS": ["P00004"],
            "3J7U": ["P00432"],
            "2CRK": ["P00563"],
            "1DPX": ["P00698"],
            "5D5R": ["P68082"],
        };

        var invPDBMap = {};
        [protMap].forEach (function (map) {
            d3.entries(map).forEach (function (entry) {
                entry.value.forEach (function (val) {
                    invPDBMap[val] = entry.key;
                }); 
            });
        });
        var protAccs = Array.from(interactors.values()).map (function (prot) { return prot.accession; });
        var validAcc = protAccs.find (function(acc) { return invPDBMap[acc] !== undefined; });
        return invPDBMap [validAcc];    // quick protein accession to pdb lookup for now
    },
};

CLMSUI.modelUtils.amino1to3Map = _.invert (CLMSUI.modelUtils.amino3to1Map);
