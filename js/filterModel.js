var CLMSUI = CLMSUI || {};

CLMSUI.BackboneModelTypes = _.extend(CLMSUI.BackboneModelTypes || {},

    {
        FilterModel: Backbone.Model.extend({
            defaults: {
                manualMode: true,
                fdrMode: false,
                //subset
                linears: true,
                crosslinks: true,
                betweenLinks: true,
                selfLinks: true,
                homomultimericLinks: true,
                ambig: true,
                aaApart: 0,
                pepLength: 1,
                //validation status
                A: true,
                B: true,
                C: true,
                Q: true,
                unval: false,
                AUTO: false,
                decoys: true,
                //fdr
                fdrThreshold: 0.05,
                interFdrCut: undefined,
                intraFdrCut: undefined,
                //navigation
                pepSeq: "",
                protNames: "",
                charge: "",
                runName: "",
                scanNumber: "",
                urpPpi: 1,
            },

            initialize: function(options, secondarySettings) {
                if (!this.get("matchScoreCutoff")) {
                    this.set("matchScoreCutoff", [0, 100]);
                    // ^^^setting an array in defaults passes that same array reference to every instantiated model, so do it in initialize
                }
                
                // scoreExtent used to restrain text input values
                this.scoreExtent = (secondarySettings ? secondarySettings.scoreExtent : undefined) || this.get("matchScoreCutoff").slice(0);
                // possibleSearchGroups used to restrain searchGroup options
                this.possibleSearchGroups = (secondarySettings ? secondarySettings.possibleSearchGroups : undefined) || this.get("searchGroups").slice(0);
                //this.scoreExtent = this.matches.extent (fu)
                this.valMap = d3.map();
                this.valMap.set("?", "Q");
                this.preprocessedInputText = d3.map(); // preprocessed user input values so they're not constantly reparsed for every match

                this.resetValues = this.toJSON(); // Store copy of original values if needed to restore later
            },

            resetFilter: function() {
                this
                    .clear({
                        silent: true
                    })
                    .set(this.resetValues);
                
                return this;
            },

            processTextFilters: function (searchArray) {
                var protSplit1 = this.get("protNames").toLowerCase().split(","); // split by commas
                this.preprocessedInputText.set("protNames", protSplit1.map(function(prot) {
                    return prot.split("-");
                })); // split these in turn by hyphens
                //console.log ("preprocessedInputText", this.preprocessedInputText.get("protNames"));

                var chargeRange = this.get("charge").split("-").map(function(val, i) {
                    return +val || [0, Infinity][i];
                });
                this.preprocessedInputText.set("chargeRange", chargeRange);

                var pepSeq = this.get("pepSeq");
                var splitPepSeq = pepSeq.split("-").map(function(part) {
                    return {
                        upper: part.toUpperCase(),
                        lower: part.toLowerCase()
                    };
                });
                this.preprocessedInputText.set("pepSeq", splitPepSeq);
                
                // Search group pre calculations
                this.precalcedSearchGroupsSet = d3.set(this.get("searchGroups"));
                
                var searchGroupMap = d3.map ();
                searchArray.forEach (function (search) {
                    searchGroupMap.set (search.id, search.group);    
                });
                this.precalcedSearchToGroupMap = searchGroupMap;
            },

            naiveProteinMatch: function(p1, p2) {
                return p1 === p2;
            },

            subsetFilter: function(match, matchingProteinPairFunc) {
                matchingProteinPairFunc = matchingProteinPairFunc || this.naiveProteinMatch; // naive default match
                var linear = match.isLinear();
                var ambig = match.isAmbig();

                //linears? - if linear (linkPos === 0) and linears not selected return false
                //cross-links? - if xl (linkPos > 0) and xls not selected return false
                if (this.get(linear ? "linears" : "crosslinks") === false) {
                    return false;
                }

                //ambigs? - if ambig's not selected and match is ambig return false
                if (ambig && !this.get("ambig")) {
                    return false;
                }

                //self-links? - if self links's not selected and match is self link return false
                // possible an ambiguous self link will still get displayed
                var showSelfLinks = this.get("selfLinks");
                var showBetweenLinks = this.get("betweenLinks");
                var showHomomultimericLinks = this.get("homomultimericLinks");
                // if ((showSelfLinks || showBetweenLinks) && !linear) { // we don't test linears here

                if (!((match.couldBelongToSelfLink == true && showSelfLinks && !match.confirmedHomomultimer) ||
                        (match.couldBelongToBetweenLink == true && showBetweenLinks) ||
                        (match.confirmedHomomultimer == true && showHomomultimericLinks))) {
                    return false;
                }

                // }

                //temp
                var aaApart = +this.get("aaApart");
                if (!isNaN(aaApart)) {
                    // if not homomultimer and not ambig and is a selfLink
                    if ( /*!match.confirmedHomomultimer &&*/ !ambig && match.crossLinks[0].isSelfLink()) {
                        // linears report false for isSelfLink so they never get to this bit (where toResidue would be null)
                        var unambigCrossLink = match.crossLinks[0];
                        var calc = Math.abs(unambigCrossLink.toResidue - unambigCrossLink.fromResidue);
                        if (calc < aaApart) {
                            return false;
                        }
                    }
                }

                var pepLengthFilter = +this.get("pepLength");
                if (!isNaN(pepLengthFilter)) {
                    var seq1length = match.matchedPeptides[0].sequence.length;
                    if (seq1length > 0 && (seq1length < pepLengthFilter ||
                            (!linear && match.matchedPeptides[1].sequence.length < pepLengthFilter))) {
                        return false;
                    }
                }

                return true;
            },

            scoreFilter: function(match) {
                var msc = this.get("matchScoreCutoff");
                //defend against not having a score (from a CSV file without such a column)
                if (match.score() === undefined) {
                    return true;
                }
                return (msc[0] == undefined || match.score() >= msc[0]) && (msc[1] == undefined || match.score() <= msc[1]); // == undefined cos shared links get undefined json'ified to null
            },

            decoyFilter: function(match) {
                return !match.isDecoy() || this.get("decoys");
            },

            validationStatusFilter: function(match) {
                var vChar = match.validated;
                if (vChar != 'R') {
                    if (this.get(vChar) || this.get(this.valMap.get(vChar))) return true;
                    if (match.autovalidated && this.get("AUTO")) return true;
                    if (!match.autovalidated && !vChar && this.get("unval")) return true;
                }

                return false;
            },

            proteinNameCheck: function(match, searchString) {
                if (searchString) {
                    //protein name check
                    var stringPartArrays = this.preprocessedInputText.get("protNames");
                    var participants = CLMSUI.compositeModelInst.get("clmsModel").get("participants");
                    var matchedPeptides = match.matchedPeptides;
                    var matchedPepCount = matchedPeptides.length;

                    for (var spa = 0; spa < stringPartArrays.length; spa++) {
                        var stringPartArr = stringPartArrays[spa];
                        var used = [];
                        var matchedProteins = 0;

                        for (var ns = 0; ns < stringPartArr.length; ns++) {
                            var nameString = stringPartArr[ns];
                            var found = false;

                            for (var i = 0; i < matchedPepCount; i++) {
                                var matchedPeptide = matchedPeptides[i];
                                if (found === false && typeof used[i] == 'undefined') {
                                    var pids = matchedPeptide.prt;
                                    var pidCount = pids.length;
                                    for (var p = 0; p < pidCount; p++) {
                                        var interactor = participants.get(pids[p]);
                                        var toSearch = interactor.name + " " + interactor.description;
                                        if (toSearch.toLowerCase().indexOf(nameString) != -1) {
                                            found = true;
                                            used[i] = true; // so can't match two strings to same peptide e.g. "dog-cat" to protein associated with same peptide
                                            break;
                                        }
                                    }
                                }
                            }
                            // this string is found in one of the protein names/descriptors associated with one of the match's so far unused peptides, so increment a counter
                            if (found) {
                                matchedProteins++;
                            }
                        }
                        // if number of matched proteins equals number of part strings to be matched then match passes the filter
                        //console.log ("fp", foundPeptides, stringPartArr.length, foundPeptides === stringPartArr.length);
                        if (matchedProteins === stringPartArr.length) {
                            return true;
                        }
                    }
                    // return false if reach end of loop (no true condition found)
                    return false;
                }
                // return true if no string to match against
                return true;
            },

            navigationFilter: function(match) {
                // Arranged so cheaper checks are done first

                //charge check - charge now not filtered
                /*
                var chargeFilter = this.get("charge");
                var chargeRange = this.preprocessedInputText.get("chargeRange");
                var mpCharge = match.precursorCharge;
                if (chargeFilter && (chargeRange.length === 1 ? mpCharge !== chargeRange[0] : (mpCharge < chargeRange[0] || mpCharge > chargeRange[1]))) {
                    return false;
                }
                */

                //run name check
                var runNameFilter = this.get("runName");
                if (runNameFilter &&
                    match.runName().toLowerCase().indexOf(runNameFilter.toLowerCase()) == -1) {
                    return false;
                }

                //scan number check
                var scanNumberFilter = parseInt (this.get("scanNumber"));
                if (!isNaN(scanNumberFilter) &&
                    match.scanNumber !== scanNumberFilter
                    //match.scanNumber.toString().toLowerCase().indexOf(scanNumberFilter.toLowerCase()) == -1
                ) {
                    return false;
                }

                //protein name check
                if (this.proteinNameCheck(match, this.get("protNames")) === false) {
                    return false;
                }


                //peptide seq check
                if (seqCheck(this.get("pepSeq"), this.preprocessedInputText.get("pepSeq")) === false) {
                    return false;
                }

                //end of filtering check
                return true;

                //util functions used in nav filter check:

                //peptide seq check function
                function seqCheck(searchString, preprocPepStrings) { //preprocPepStrings: "KK-KR" will be [{upper:"KK", lower:"kk}, {upper:"KR", lower:"kr"}]
                    if (searchString) {
                        var matchedPeptides = match.matchedPeptides;
                        var matchedPepCount = matchedPeptides.length;

                        //var pepStrings = searchString.split('-');
                        //var pepStringsCount = pepStrings.length;
                        var pepStringsCount = preprocPepStrings.length;

                        if (pepStringsCount == 1) {
                            var uppercasePep = preprocPepStrings[0].upper;
                            var lowercasePep = preprocPepStrings[0].lower
                            for (var i = 0; i < matchedPepCount; i++) {
                                var matchedPeptide = matchedPeptides[i];
                                if (matchedPeptide.sequence.indexOf(uppercasePep) != -1 ||
                                    (matchedPeptide.seq_mods && matchedPeptide.seq_mods.toLowerCase().indexOf(lowercasePep) != -1)) {
                                    return true;
                                }
                            }
                            return false;
                        }

                        var aggMatchedCount = 0;
                        for (var ps = 0; ps < pepStringsCount; ps++) {
                            var pepStringCases = preprocPepStrings[ps];
                            var uppercasePep = pepStringCases.upper;
                            var lowercasePep = pepStringCases.lower;
                            var matchCount = 0;
                            for (var i = 0; i < matchedPepCount; i++) {
                                var matchedPeptide = matchedPeptides[i];
                                if (matchedPeptide.sequence.indexOf(uppercasePep) != -1 ||
                                    (matchedPeptide.seq_mods && matchedPeptide.seq_mods.toLowerCase().indexOf(lowercasePep) != -1)) {
                                    matchCount += (i + 1); // add 1 for first matched peptide, add 2 for second. So will be 3 if both.
                                }
                            }
                            if (matchCount === 0) return false; // neither peptide matches this part of the input string, so match can't pass the filter
                            aggMatchedCount |= matchCount; // logically aggregate to aggMatchedCount
                        }
                        // If 1, both pepstrings matched first peptide. If 2, both pepstrings matched second peptide.
                        // Can't be one pepstring matching both peptides and the other neither, as an individual zero matchcount would return false in the loop 
                        // (so can't be 0 in total either)
                        // So 3 must be the case where both peptides contain the pepstrings, such that one or both pepstrings are present at alternate ends
                        return aggMatchedCount === 3;
                    }
                    return true;
                }
            },
            
            
            groupFilter: function (match) {
                if (this.possibleSearchGroups.length > 1) {
                    var matchGroup = this.precalcedSearchToGroupMap.get (match.searchId);
                    return this.precalcedSearchGroupsSet.has (matchGroup);
                }
                return true;
            },



            stateString: function() {
                // https://library.stanford.edu/research/data-management-services/case-studies/case-study-file-naming-done-well
                var fields = [];

                // http://www.indiana.edu/~letrs/help-services/QuickGuides/oed-abbr.html
                // https://www.allacronyms.com/
                var abbvMap = {
                    intraFdrCut: "SELFCUT",
                    interFdrCut: "BTWNCUT",
                    fdrMode: "FDR",
                    manualMode: "MAN",
                    betweenLinks: "BTWN",
                    selfLinks: "SELF",
                    pepLength: "PEPLEN",
                    fdrThreshold: "THR",
                    matchScoreCutoff: "MATCHSCORES",
                    aaApart: "APART",
                    crosslinks: "XLINKS",
                    homomultimericLinks: "HOMOM",
                    searchGroups: "GROUPS",
                };
                var zeroFormatFields = d3.set(["intraFdrCut", "interFdrCut", "scores"]);
                if (this.get("fdrMode")) {
                    fields = ["fdrMode", "fdrThreshold", "ambig", "betweenLinks", "selfLinks", "aaApart", "pepLength"];
                    // no point listing inter/intra fdr cut if between/self links aren't active
                    if (this.get("betweenLinks")) {
                        fields.splice(1, 0, "interFdrCut");
                    }
                    if (this.get("selfLinks")) {
                        fields.splice(1, 0, "intraFdrCut");
                    }
                } else {
                    var antiFields = ["fdrThreshold", "interFdrCut", "intraFdrCut", "fdrMode"];
                    if (this.get("matchScoreCutoff")[1] == undefined) { // ignore matchscorecutoff if everything allowed
                        antiFields.push("matchScoreCutoff");
                    }
                    fields = d3.keys(_.omit(this.attributes, antiFields));
                    //console.log ("filter fieldset", this.attributes, fields);
                }

                var str = CLMSUI.utils.objectStateToAbbvString(this, fields, zeroFormatFields, abbvMap);
                return str;
            },

            generateUrlString: function() {
                // make url parts from current filter attributes
                var parts = CLMSUI.modelUtils.makeURLQueryString (this.attributes, "F");

                // return parts of current url query string that aren't filter flags or values
                var search = window.location.search.slice(1);
                var nonFilterKeys = d3.set(["sid", "decoys", "unval", "lowestScore", "anon"]);
                var nonFilterParts = search.split("&").filter(function(nfpart) {
                    return nonFilterKeys.has(nfpart.split("=")[0]);
                });
                // and queue them to be at the start of new url query string (before filter attributes)
                parts = nonFilterParts.concat(parts);

                return window.location.origin + window.location.pathname + "?" + parts.join("&");
            },

            getFilterUrlSettings: function(urlChunkMap) {
                var urlChunkKeys = d3.keys(urlChunkMap).filter(function(key) {
                    return key[0] === "F";
                });
                var filterUrlSettingsMap = {};
                urlChunkKeys.forEach(function(key) {
                    filterUrlSettingsMap[key.slice(1)] = urlChunkMap[key];
                });
                var allowableFilterKeys = d3.keys(this.defaults);
                allowableFilterKeys.push("matchScoreCutoff", "searchGroups");
                var intersectingKeys = _.intersection(d3.keys(filterUrlSettingsMap), allowableFilterKeys);
                var filterChunkMap = _.pick(filterUrlSettingsMap, intersectingKeys);
                console.log("FCM", filterChunkMap);
                return filterChunkMap;
            },

        }),

    });