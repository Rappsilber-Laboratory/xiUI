//		a matrix viewer
//
//		Colin Combe, Martin Graham
//		Rappsilber Laboratory, 2015

var CLMSUI = CLMSUI || {};

CLMSUI.DistanceMatrixViewBB = CLMSUI.utils.BaseFrameView.extend({

    events: function() {
        var parentEvents = CLMSUI.utils.BaseFrameView.prototype.events;
        if (_.isFunction(parentEvents)) {
            parentEvents = parentEvents();
        }
        return _.extend({}, parentEvents, {
            "mousemove .mouseMat": "brushNeighbourhood",
            "mousemove .clipg": "brushNeighbourhood",
            "mouseleave .viewport": "cancelHighlights",
            "mouseleave .clipg": "cancelHighlights",
            "input .dragPanRB": "setMatrixDragMode",
        });
    },

    defaultOptions: {
        xlabel: "Residue Index 1",
        ylabel: "Residue Index 2",
        chartTitle: "Cross-Link Matrix",
        chainBackground: "white",
        matrixObj: null,
        selectedColour: "#ff0",
        highlightedColour: "#f80",
        linkWidth: 5,
        tooltipRange: 7,
        matrixDragMode: "Pan",
        margin: {
            top: 30,
            right: 20,
            bottom: 40,
            left: 60
        },
        exportKey: true,
        exportTitle: true,
        canHideToolbarArea: true,
        canTakeImage: true,
    },

    initialize: function(viewOptions) {
        CLMSUI.DistanceMatrixViewBB.__super__.initialize.apply(this, arguments);

        var self = this;

        var marginLimits = {
            top: this.options.chartTitle ? 30 : undefined,
            bottom: this.options.xlabel ? 40 : undefined,
            left: this.options.ylabel ? 60 : undefined
        };
        $.extend(this.options.margin, marginLimits);

        this.colourScaleModel = viewOptions.colourScaleModel;

        // targetDiv could be div itself or id of div - lets deal with that
        // Backbone handles the above problem now - element is now found in this.el
        //avoids prob with 'save - web page complete'
        var mainDivSel = d3.select(this.el).classed("matrixView", true);

        var flexWrapperPanel = mainDivSel.append("div")
            .attr("class", "verticalFlexContainer");

        this.controlDiv = flexWrapperPanel.append("div").attr("class", "toolbar toolbarArea");

        this.controlDiv.append("button")
            .attr("class", "downloadButton btn btn-1 btn-1a")
            .text(CLMSUI.utils.commonLabels.downloadImg + "SVG");

        var buttonHolder = this.controlDiv.append("span").attr("class", "noBreak reducePadding");
        // Radio Button group to decide pan or select
        var toggleButtonData = [{
                class: "dragPanRB",
                label: "Drag to Pan",
                id: "dragPan",
                tooltip: "Left-click and drag pans the matrix. Mouse-wheel zooms.",
                group: "matrixDragMode",
                value: "Pan"
            },
            {
                class: "dragPanRB",
                label: "Or Select",
                id: "dragSelect",
                tooltip: "Left-click and drag selects an area in the matrix",
                group: "matrixDragMode",
                value: "Select"
            },
        ];
        toggleButtonData
            .forEach(function(d) {
                $.extend(d, {
                    type: "radio",
                    inputFirst: false,
                    value: d.value || d.label
                });
                if (d.initialState === undefined && d.group && d.value) { // set initial values for radio button groups
                    d.initialState = (d.value === this.options[d.group]);
                }
            }, this);
        CLMSUI.utils.makeBackboneButtons(buttonHolder, self.el.id, toggleButtonData);


        var setSelectTitleString = function() {
            var selElem = d3.select(d3.event.target);
            selElem.attr("title", selElem.selectAll("option")
                .filter(function() {
                    return d3.select(this).property("selected");
                })
                .text()
            );
        };

        this.controlDiv.append("label")
            .attr("class", "btn selectHolder")
            .append("span")
            //.attr("class", "noBreak")
            .text("Show Protein Pairing ►")
            .append("select")
            .attr("id", mainDivSel.attr("id") + "chainSelect")
            .on("change", function(d) {
                var value = this.value;
                var selectedDatum = d3.select(this).selectAll("option")
                    .filter(function(d) {
                        return d3.select(this).property("selected");
                    })
                    .datum();
                self.setAndShowPairing(selectedDatum.value);
                var selElem = d3.select(d3.event.target);
                setSelectTitleString(selElem);
            })
        ;

        var chartDiv = flexWrapperPanel.append("div")
            .attr("class", "panelInner")
            .attr("flex-grow", 1)
            .style("position", "relative");

        var viewDiv = chartDiv.append("div")
            .attr("class", "viewDiv");


        // Scales
        this.x = d3.scale.linear();
        this.y = d3.scale.linear();

        this.zoomStatus = d3.behavior.zoom()
            .scaleExtent([1, 8])
            .on("zoom", function() {
                self.zoomHandler(self);
            });

        // Canvas viewport and element
        var canvasViewport = viewDiv.append("div")
            .attr("class", "viewport")
            .style("top", this.options.margin.top + "px")
            .style("left", this.options.margin.left + "px")
            .call(self.zoomStatus);

        this.canvas = canvasViewport
            .append("canvas")
            .attr ("class", "toSvgImage")
            .style("background", this.options.background) // override standard background colour with option
            .style("display", "none")
        ;

        canvasViewport.append("div")
            .attr("class", "mouseMat")
        ;


        // SVG element
        this.svg = viewDiv.append("svg");

        // Defs
        this.svg.append("defs")
            .append("clipPath")
            .attr("id", "matrixClip")
            .append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", 0)
            .attr("height", 0);

        this.vis = this.svg.append("g")
            .attr("transform", "translate(" + this.options.margin.left + "," + this.options.margin.top + ")");

        this.brush = d3.svg.brush()
            .x(self.x)
            .y(self.y)
            //.clamp ([false, false])
            .on("brush", function() {})
            .on("brushend", function(val) {
                self.selectNeighbourhood(self.brush.extent());
            });


        // Add clippable and pan/zoomable viewport made of two group elements
        this.clipGroup = this.vis.append("g")
            .attr("class", "clipg")
            .attr("clip-path", "url(#matrixClip)")
        ;
        this.clipGroup.append("rect").attr("width","100%").attr("height","100%").style("fill", "#e4e4e4");
        this.zoomGroup = this.clipGroup.append("g");
        this.zoomGroup.append("g").attr("class", "blockAreas");
        this.zoomGroup.append("g").attr("class", "backgroundImage").append("image");
        this.zoomGroup.append("g").attr("class", "crossLinkPlot");
        this.zoomGroup.append("g")
            .attr("class", "brush")
            .call(self.brush);

        // Axes setup
        this.xAxis = d3.svg.axis().scale(this.x).orient("bottom");
        this.yAxis = d3.svg.axis().scale(this.y).orient("left");

        this.vis.append("g").attr("class", "y axis");
        this.vis.append("g").attr("class", "x axis");


        // Add labels
        var labelInfo = [{
                class: "axis",
                text: this.options.xlabel,
                dy: "0em"
            },
            {
                class: "axis",
                text: this.options.ylabel,
                dy: "1em"
            },
            {
                class: "matrixHeader",
                text: this.options.chartTitle,
                dy: "-0.5em"
            },
        ];

        this.vis.selectAll("g.label")
            .data(labelInfo)
            .enter()
            .append("g")
            .attr("class", "label")
            .append("text")
            .attr("class", function(d) {
                return d.class;
            })
            .text(function(d) {
                return d.text;
            })
            .attr("dy", function(d) {
                return d.dy;
            });

        // rerender crosslinks if selection/highlight changed, filteringDone or colourmodel changed
        this.listenTo (this.model, "change:selection filteringDone", this.renderCrossLinks);
        this.listenTo (this.model, "currentColourModelChanged", function (colourModel, domain) {
            if (colourModel.get("id") !== this.colourScaleModel.get("id")) {    // test if model is distances, if so rendering is already guaranteed
                this.renderCrossLinks();
            }
        });
        this.listenTo (this.model, "change:highlights", function () { this.renderCrossLinks ({rehighlightOnly: true}); });
        this.listenTo (this.model, "change:linkColourAssignment", this.render);
        this.listenTo (this.model, "change:selectedProteins", this.makeProteinPairingOptions);
        this.listenTo (this.colourScaleModel, "colourModelChanged", function () { this.render({noResize: true}); }); // colourScaleModel is pointer to distance colour model, so this triggers even if not current colour model (redraws background)
        this.listenTo (this.model.get("clmsModel"), "change:distancesObj", this.distancesChanged); // Entire new set of distances
        this.listenTo (this.model.get("clmsModel"), "change:matches", this.matchesChanged); // New matches added (via csv generally)
        this.listenTo (CLMSUI.vent, "proteinMetadataUpdated", function() {
            this.makeProteinPairingOptions();
            this.updateAxisLabels();
        });
        this.listenTo (CLMSUI.vent, "PDBPermittedChainSetsUpdated changeAllowInterModelDistances", this.distancesChanged); // New PDB or existing residues/pdb but distances changed

        var entries = this.makeProteinPairingOptions();
        var startPairing = _.isEmpty(entries) ? undefined : entries[0].value;
        this.setAndShowPairing(startPairing);

        this.setMatrixDragMode({
            target: {
                value: this.options.matrixDragMode
            }
        });
    },

    relayout: function() {
        this.resize();
        return this;
    },

    setAndShowPairing: function(pairing) {
        this
            .matrixChosen(pairing)
            .resetZoomHandler(this)
            .render();
    },

    makeProteinPairingOptions: function() {
        var crossLinks = this.model.getAllTTCrossLinks();
        var totals = CLMSUI.modelUtils.crosslinkCountPerProteinPairing(crossLinks);
        var entries = d3.entries(totals);

        var nonEmptyEntries = entries.filter(function(entry) {
            return entry.value.crossLinks.length;
        });

        // If there are selected proteins, reduce the choice to pairs within this set
        var selectedProteins = this.model.get("selectedProteins");
        if (selectedProteins.length) {
            var selectedProteinSet = d3.set (_.pluck(selectedProteins, "id"));
            nonEmptyEntries = nonEmptyEntries.filter (function (entry) {
                var value = entry.value;
                return selectedProteinSet.has (value.fromProtein.id) && selectedProteinSet.has (value.toProtein.id);
            });
        }

        nonEmptyEntries.sort(function(a, b) {
            return b.value.crossLinks.length - a.value.crossLinks.length;
        });

        var mainDivSel = d3.select(this.el);
        var matrixOptions = mainDivSel.select("#" + mainDivSel.attr("id") + "chainSelect")
            .selectAll("option")
            .data(nonEmptyEntries, function(d) {
                return d.key;
            })
        ;
        matrixOptions.exit().remove();
        matrixOptions
            .enter()
            .append("option")
        ;
        matrixOptions
            .order()
            .property("value", function(d) {
                return d.key;
            })
            .text(function(d) {
                return "[" + d.value.crossLinks.length + "] " + d.value.label;
            })
        ;

        return nonEmptyEntries.length ? nonEmptyEntries : entries;
    },

    getCurrentPairing: function(pairing, onlyIfNoneSelected) {
        var mainDivSel = d3.select(this.el);
        var selected = mainDivSel.select("#" + mainDivSel.attr("id") + "chainSelect")
            .selectAll("option")
            .filter(function(d) {
                return d3.select(this).property("selected");
            });
        return (selected.size() === 0 && onlyIfNoneSelected) ? pairing : selected.datum().value;
    },

    matchesChanged: function() {
        var entries = this.makeProteinPairingOptions();
        var pairing = this.getCurrentPairing(entries[0], true);
        this.matrixChosen(pairing);
        this.render();
        return this;
    },

    // Either new PDB File in town, or change to existing distances
    distancesChanged: function() {
        this.render();
        return this;
    },

    updateAxisLabels: function() {
        var protIDs = this.getCurrentProteinIDs();
        this.vis.selectAll("g.label text").data(protIDs)
            .text(function(d) {
                return d.labelText;
            })
        ;
    },

    matrixChosen: function(proteinPairValue) {
        if (proteinPairValue) {
            this.options.matrixObj = proteinPairValue;

            var seqLengths = this.getSeqLengthData();
            this.x.domain([1, seqLengths.lengthA + 1]);
            this.y.domain([seqLengths.lengthB + 1, 1]);

            // Update x/y labels and axes tick formats
            this.xAxis.tickFormat(this.alignedIndexAxisFormat);
            this.yAxis.tickFormat(this.alignedIndexAxisFormat);

            this.updateAxisLabels();
        }

        return this;
    },

    // chain may show if checked in dropdown and if allowed by chainset in distancesobj (i.e. not cutoff by assembly choice)
    chainMayShow: function(dropdownIndex, chainIndex) {
        var distanceObj = this.model.get("clmsModel").get("distancesObj");
        var allowedChains = distanceObj ? distanceObj.permittedChainIndicesSet : null;
        return allowedChains ? allowedChains.has(chainIndex) : true;
    },

    alignedIndexAxisFormat: function(searchIndex) {
        return d3.format(",.0f")(searchIndex);
    },

    getCurrentProteinIDs: function() {
        var mObj = this.options.matrixObj;
        return mObj ? [{
                chainIDs: null,
                proteinID: mObj.fromProtein.id,
                labelText: mObj.fromProtein.name.replace("_", " ")
            },
            {
                chainIDs: null,
                proteinID: mObj.toProtein.id,
                labelText: mObj.toProtein.name.replace("_", " ")
            }
        ] : [null, null];
    },

    getChainsForProtein: function(proteinID) {
        return this.model.get("clmsModel").get("distancesObj").chainMap[proteinID];
    },

    addAlignIDs: function(proteinIDsObj) {
        var distancesObj = this.model.get("clmsModel").get("distancesObj");
        proteinIDsObj.forEach(function(pid) {
            pid.alignID = null;
            if (pid.proteinID) {
                var chainName = CLMSUI.NGLUtils.getChainNameFromChainIndex(distancesObj.chainMap, pid.chainID);
                pid.alignID = CLMSUI.NGLUtils.make3DAlignID(distancesObj.structureName, chainName, pid.chainID);
            }
        }, this);
        return proteinIDsObj;
    },


    getOverallScale: function (sizeData) {
        var sd = sizeData || this.getSizeData();
        var baseScale = Math.min (sd.width / sd.lengthA, sd.height / sd.lengthB);
        return baseScale * this.zoomStatus.scale();
    },

    // Tooltip functions
    convertEvtToXY: function(evt) {
        var sd = this.getSizeData();

        // *****!$$$ finally, cross-browser
        var elem = d3.select(this.el).select(".viewport");
        var px = evt.pageX - $(elem.node()).offset().left;
        var py = evt.pageY - $(elem.node()).offset().top;
        //console.log ("p", evt, px, py, evt.target, evt.originalEvent.offsetX);

        var t = this.zoomStatus.translate();
        var scale = this.getOverallScale (sd);
        //console.log ("XXXY", this.zoomStatus.scale(), baseScale, scale, t);

        px -= t[0]; // translate
        py -= t[1];
        //console.log ("p2", px, py);

        px /= scale; // scale
        py /= scale;
        //console.log ("p3", px, py);

        px++; // +1 cos crosslinks are 1-indexed
        py = (sd.lengthB - 1) - py; // flip because y is bigger at top
        //console.log ("p4", px, py);

        return [Math.round(px), Math.round(py)];
    },

    grabNeighbourhoodLinks: function(extent) {
        var filteredCrossLinks = this.model.getFilteredCrossLinks();
        var filteredCrossLinkMap = d3.map(filteredCrossLinks, function(d) {
            return d.id;
        });
        var proteinIDs = this.getCurrentProteinIDs();
        var convFunc = function(x, y) { // x and y are 0-indexed
            return {
                convX: x,
                convY: y,
                proteinX: proteinIDs[0] ? proteinIDs[0].proteinID : undefined,
                proteinY: proteinIDs[1] ? proteinIDs[1].proteinID : undefined,
            };
        };
        var neighbourhoodLinks = CLMSUI.modelUtils.findResiduesInSquare(convFunc, filteredCrossLinkMap, extent[0][0], extent[0][1], extent[1][0], extent[1][1], true);
        return neighbourhoodLinks;
    },

    selectNeighbourhood: function(extent) {
        var add = d3.event.ctrlKey || d3.event.shiftKey; // should this be added to current selection?
        var linkWrappers = this.grabNeighbourhoodLinks(extent);
        var crossLinks = _.pluck(linkWrappers, "crossLink");
        this.model.setMarkedCrossLinks("selection", crossLinks, false, add);
    },


    // Brush neighbourhood and invoke tooltip
    brushNeighbourhood: function(evt) {
        var xy = this.convertEvtToXY(evt);
        var halfRange = this.options.tooltipRange / 2;
        var highlightExtent = d3.transpose(xy.map(function(xory) {
            return [xory - halfRange, xory + halfRange];
        })); // turn xy into extent equivalent
        var linkWrappers = this.grabNeighbourhoodLinks(highlightExtent);
        var crossLinks = _.pluck(linkWrappers, "crossLink");

        // invoke tooltip before setting highlights model change for quicker tooltip response
        this.invokeTooltip(evt, linkWrappers);
        this.model.setMarkedCrossLinks("highlights", crossLinks, true, false);
    },

    cancelHighlights: function() {
        this.model.setMarkedCrossLinks("highlights", [], true, false);
    },

    setMatrixDragMode: function(evt) {
        this.options.matrixDragMode = evt.target.value;
        var top = d3.select(this.el);
        if (this.options.matrixDragMode === "Pan") {
            top.select(".viewport").call(this.zoomStatus);
            top.selectAll(".clipg .brush rect").style("pointer-events", "none");
        } else {
            top.select(".viewport").on(".zoom", null);
            top.selectAll(".clipg .brush rect").style("pointer-events", null);
        }
        return this;
    },

    invokeTooltip: function(evt, linkWrappers) {
        if (this.options.matrixObj) {
            var crossLinks = _.pluck(linkWrappers, "crossLink");
            crossLinks.sort (function (a, b) {
                return a.getMeta("distance") - b.getMeta("distance");
            });
            var linkDistances = crossLinks.map (function (crossLink) {
                return crossLink.getMeta("distance");
            });

            this.model.get("tooltipModel")
                .set("header", CLMSUI.modelUtils.makeTooltipTitle.linkList(crossLinks.length))
                .set("contents", CLMSUI.modelUtils.makeTooltipContents.linkList(crossLinks, {"Distance": linkDistances}))
                .set("location", evt)
            ;
            //this.trigger("change:location", this.model, evt); // necessary to change position 'cos d3 event is a global property, it won't register as a change
        }
    },
    // end of tooltip functions

    zoomHandler: function(self) {
        var sizeData = this.getSizeData();
        var width = sizeData.width;
        var height = sizeData.height;
        // bounded zoom behavior adapted from https://gist.github.com/shawnbot/6518285
        // (d3 events translate and scale values are just copied from zoomStatus)

        var widthRatio = width / sizeData.lengthA;
        var heightRatio = height / sizeData.lengthB;
        var minRatio = Math.min(widthRatio, heightRatio);

        var fx = sizeData.lengthA * minRatio;
        var fy = sizeData.lengthB * minRatio;

        var tx = Math.min(0, Math.max(d3.event.translate[0], fx - (fx * d3.event.scale)));
        var ty = Math.min(0, Math.max(d3.event.translate[1], fy - (fy * d3.event.scale)));
        //console.log ("tx", tx, ty, fx, fy, width, height);
        self.zoomStatus.translate([tx, ty]);
        self.panZoom();
    },

    resetZoomHandler: function(self) {
        self.zoomStatus.scale(1.0).translate([0, 0]);
        return this;
    },

    // That's how you define the value of a pixel //
    // http://stackoverflow.com/questions/7812514/drawing-a-dot-on-html5-canvas
    // moved from out of render() as firefox in strict mode objected
    drawPixel: function(cd, pixi, r, g, b, a) {
        var index = pixi * 4;
        cd[index] = r;
        cd[index + 1] = g;
        cd[index + 2] = b;
        cd[index + 3] = a;
    },

    render: function (renderOptions) {
        renderOptions = renderOptions || {};
        if (this.options.matrixObj && this.isVisible()) {
            if (!renderOptions.noResize) {
                this.resize();
            }
            this
                .renderBackgroundMap()
                .renderCrossLinks({
                    isVisible: true
                })
            ;
        }
        return this;
    },

    // draw white blocks in background to demarcate areas covered by active pdb chains
    renderChainBlocks: function (alignInfo) {

        var seqLengths = this.getSeqLengthData();
        var seqLengthB = seqLengths.lengthB - 1;

        // Find continuous blocks for each chain when mapped to search sequence (as chain sequence may have gaps in) (called in next bit of code)
        var blockMap = {};
        d3.merge(alignInfo).forEach (function (alignDatum) {
            blockMap[alignDatum.alignID] = this.model.get("alignColl").get(alignDatum.proteinID).blockify(alignDatum.alignID);
        }, this);
        //console.log ("blockMap", blockMap);

        // Draw backgrounds for each pairing of chains
        var blockAreas = this.zoomGroup.select(".blockAreas");
        var blockSel = blockAreas.selectAll(".chainArea");
        blockSel.remove();

        //console.log ("BLOX", blockMap);

        var allowInterModel = this.model.get("stageModel").get("allowInterModelDistances");

        alignInfo[0].forEach (function (alignInfo1) {
            var blocks1 = blockMap[alignInfo1.alignID];

            alignInfo[1].forEach (function (alignInfo2) {
                if ((alignInfo1.modelID === alignInfo2.modelID) || allowInterModel) {
                    var blocks2 = blockMap[alignInfo2.alignID];

                    blocks1.forEach (function (brange1) {
                        blocks2.forEach (function (brange2) {
                            blockAreas.append("rect")
                                .attr("x", brange1.begin - 1)
                                .attr("y", seqLengthB - (brange2.end - 1))
                                .attr("width", brange1.end - brange1.begin + 1)
                                .attr("height", brange2.end - brange2.begin + 1)
                                .attr("class", "chainArea")
                                .style("fill", this.options.chainBackground);
                        }, this);
                    }, this);
                }
            }, this);

        }, this);
    },

    renderBackgroundMap: function() {
        var z = performance.now();
        var distancesObj = this.model.get("clmsModel").get("distancesObj");
        var stageModel = this.model.get("stageModel");

        // only render background if distances available
        if (distancesObj) {

            // Get alignment info for chains in the two proteins, filtering to chains that are marked as showable
            var proteinIDs = this.getCurrentProteinIDs();
            var alignInfo = proteinIDs.map(function(proteinID, i) {
                var pid = proteinID.proteinID;
                var chains = distancesObj.chainMap[pid];
                if (chains) {
                    var chainIDs = chains
                        .filter(function(chain) {
                            return this.chainMayShow(i, chain.index);
                        }, this)
                        .map(function(chain) {
                            return {
                                proteinID: pid,
                                chainID: chain.index,
                                modelID: chain.modelIndex,
                            };
                        });
                    return this.addAlignIDs(chainIDs);
                }
                return [];
            }, this);
            //console.log ("ALLL", alignInfo);

            // draw the areas covered by pdb chain data
            this.renderChainBlocks(alignInfo);

            var seqLengths = this.getSeqLengthData();
            // Don't draw backgrounds for huge protein combinations (5,000,000 =~ 2250 x 2250 is limit), begins to be memory issue
            if (seqLengths.lengthA * seqLengths.lengthB > 5e6) {
                // shrink canvas / hide image if not showing it
                this.canvas
                    .attr("width", 1)
                    .attr("height", 1)
                ;
                this.zoomGroup.select(".backgroundImage").select("image").style("display", "none");
            } else {
                this.canvas
                    .attr("width", seqLengths.lengthA)
                    .attr("height", seqLengths.lengthB)
                ;
                var canvasNode = this.canvas.node();
                var ctx = canvasNode.getContext("2d");
                //ctx.fillStyle = "rgba(255, 0, 0, 0)";
                ctx.clearRect(0, 0, canvasNode.width, canvasNode.height);

                var rangeDomain = this.colourScaleModel.get("colScale").domain();
                var min = rangeDomain[0];
                var max = rangeDomain[1];
                var rangeColours = this.colourScaleModel.get("colScale").range();
                var cols = rangeColours; //.slice (1,3);
                // have slightly different saturation/luminance for each colour so shows up in black & white
                var colourArray = cols.map(function(col, i) {
                    col = d3.hsl(col);
                    col.s = 0.4; // - (0.1 * i);
                    col.l = 0.85; // - (0.1 * i);
                    var col2 = col.rgb();
                    return (255 << 24) + (col2.b << 16) + (col2.g << 8) + col2.r;   // 32-bit value of colour
                });

                var seqLengthB = seqLengths.lengthB - 1;

                CLMSUI.times = CLMSUI.times || [];
                var start = performance.now();

                // function to draw one matrix according to a pairing of two chains (called in loop later)
                var drawDistanceMatrix = function (imgDataArr, minArray, matrixValue, alignInfo1, alignInfo2) {
                    var alignColl = this.model.get("alignColl");
                    var distanceMatrix = matrixValue.distanceMatrix;
                    var pw = this.canvas.attr("width");

                    var atoms1 = stageModel.getAllResidueCoordsForChain (matrixValue.chain1);
                    var atoms2 = (matrixValue.chain1 !== matrixValue.chain2) ? stageModel.getAllResidueCoordsForChain (matrixValue.chain2) : atoms1;
                    // precalc some stuff that would get recalculatd a lot in the inner loop
                    var preCalcSearchIndices = d3.range(atoms2.length).map(function(seqIndex) {
                        return alignColl.getAlignedIndex(seqIndex + 1, alignInfo2.proteinID, true, alignInfo2.alignID, true) - 1;
                    });
                    var preCalcRowIndices = preCalcSearchIndices.map (function (i) { return i >= 0 ? (seqLengthB - i) * pw : -1; });
                    //console.log ("pcsi", preCalcSearchIndices);
                    //console.log ("atoms", atoms1, atoms2);

                    // draw chain values, aligned to search sequence
                    var max2 = max * max;
                    var min2 = min * min;

                    //var p = performance.now();
                    var len = atoms2.length;
                    for (var i = 0; i < atoms1.length; i++) {
                        var searchIndex1 = alignColl.getAlignedIndex(i + 1, alignInfo1.proteinID, true, alignInfo1.alignID, true) - 1;
                        if (searchIndex1 >= 0) {
                            var row = distanceMatrix[i];
                            for (var j = 0; j < len; j++) { // was seqLength
                                var distance2 = row && row[j] ? row[j] * row[j] : CLMSUI.modelUtils.getDistanceSquared (atoms1[i], atoms2[j]);
                                if (distance2 < max2) {
                                    var searchIndex2 = preCalcRowIndices[j];
                                    if (searchIndex2 >= 0) {
                                        var aindex = searchIndex1 + searchIndex2;   //((seqLengthB - searchIndex2) * pw);
                                        var val = minArray ? minArray[aindex] : 0;
                                        var r = distance2 > min2 ? 1 : 2;
                                        if (r > val) {
                                            imgDataArr[aindex] = colourArray[2 - r];    // 32-bit array view can take colour directly
                                            if (minArray) {
                                                minArray[aindex] = r;//val;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    //p = performance.now() - p;
                    //console.log (atoms1.length * atoms2.length, "coordinates drawn to canvas in ", p, " ms.");
                };

                var middle = performance.now();

                var canvasData = ctx.getImageData(0, 0, this.canvas.attr("width"), this.canvas.attr("height"));
                var cd = new Uint32Array (canvasData.data.buffer); // canvasData.data         // 32-bit view of buffer
                var minArray = (alignInfo[0].length * alignInfo[1].length) > 1 ? new Uint8Array(this.canvas.attr("width") * this.canvas.attr("height")) : undefined;

                // draw actual content of chain pairings
                alignInfo[0].forEach(function(alignInfo1) {
                    var chainIndex1 = alignInfo1.chainID;
                    alignInfo[1].forEach(function(alignInfo2) {
                        var chainIndex2 = alignInfo2.chainID;
                        var distanceMatrixValue = distancesObj.matrices[chainIndex1 + "-" + chainIndex2];
                        drawDistanceMatrix.call(this, cd, minArray, distanceMatrixValue, alignInfo1, alignInfo2);
                    }, this);
                }, this);

                ctx.putImageData(canvasData, 0, 0);

                var end = performance.now();
                CLMSUI.times.push(Math.round(end - middle));
                //console.log ("CLMSUI.times", CLMSUI.times);

                this.zoomGroup.select(".backgroundImage").select("image")
                    .style("display", null) // default value
                    .attr("width", this.canvas.attr("width"))
                    .attr("height", this.canvas.attr("height"))
                    .attr("xlink:href", canvasNode.toDataURL("image/png"))
                ;
            }
        }
        z = performance.now() - z;
        console.log ("render background map", z, "ms");

        return this;
    },

    renderCrossLinks: function (renderOptions) {

        renderOptions = renderOptions || {};
        //console.log ("renderCrossLinks", renderOptions);

        if (renderOptions.isVisible || (this.options.matrixObj && this.isVisible())) {
            var self = this;

            if (this.options.matrixObj) {
                var highlightOnly = renderOptions.rehighlightOnly;
                var colourScheme = this.model.get("linkColourAssignment");

                var seqLengths = this.getSeqLengthData();
                var seqLengthB = seqLengths.lengthB - 1;
                var xStep = 1; //minDim / seqLengthA;
                var yStep = 1; //minDim / seqLengthB;
                var linkWidth = this.options.linkWidth / 2;
                var overallScale = this.getOverallScale();
                if (overallScale < 1 && overallScale > 0) {
                    linkWidth /= overallScale;
                    linkWidth = Math.ceil (linkWidth);
                }
                //console.log ("os", overallScale);
                var xLinkWidth = linkWidth * xStep;
                var yLinkWidth = linkWidth * yStep;

                var proteinIDs = this.getCurrentProteinIDs();

                var filteredCrossLinks = this.model.getFilteredCrossLinks(); //.values();
                var selectedCrossLinkIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("selection"), "id"));
                var highlightedCrossLinkIDs = d3.set(_.pluck(this.model.getMarkedCrossLinks("highlights"), "id"));

                var finalCrossLinks = Array.from(filteredCrossLinks).filter(function(crossLink) {
                    return (crossLink.toProtein.id === proteinIDs[0].proteinID && crossLink.fromProtein.id === proteinIDs[1].proteinID) || (crossLink.toProtein.id === proteinIDs[1].proteinID && crossLink.fromProtein.id === proteinIDs[0].proteinID);
                }, this);

                // sort so that selected links appear on top
                var sortedFinalCrossLinks;
                if (highlightOnly) {
                    sortedFinalCrossLinks = finalCrossLinks.filter (function (link) { return highlightedCrossLinkIDs.has(link.id); });
                } else {
                    sortedFinalCrossLinks = CLMSUI.modelUtils.radixSort (3, finalCrossLinks, function(link) {
                        return highlightedCrossLinkIDs.has(link.id) ? 2 : (selectedCrossLinkIDs.has(link.id) ? 1 : 0);
                    });
                }


                var fromToStore = sortedFinalCrossLinks.map(function(crossLink) {
                    return [crossLink.fromResidue - 1, crossLink.toResidue - 1];
                });

                var indLinkPlot = function (d) {
                    var high = highlightedCrossLinkIDs.has(d.id);
                    var selected = high ? false : selectedCrossLinkIDs.has(d.id);
                    var ambig = d.ambiguous;
                    d3.select(this)
                        .attr ("class", "crossLink" + (high ? " high" : ""))
                        .style("fill-opacity", ambig ? 0.6 : null)
                        .style("fill", high ? self.options.highlightedColour : (selected ? self.options.selectedColour : colourScheme.getColour(d)))
                        .style("stroke-dasharray", ambig ? 3 : null)
                        .style("stroke", high || selected ? "black" : (ambig ? colourScheme.getColour(d) : null))
                        //.style ("stroke-opacity", high || selected ? 0.4 : null)
                    ;
                };

                // if redoing highlights only, find previously highlighted links not part of current set and restore them
                // to a non-highlighted state
                if (highlightOnly) {
                    var oldHighLinkSel = this.zoomGroup.select(".crossLinkPlot").selectAll(".high")
                        .filter (function (d) {
                            return ! highlightedCrossLinkIDs.has(d.id);
                        })
                        .each (indLinkPlot)
                    ;
                }

                var linkSel = this.zoomGroup.select(".crossLinkPlot").selectAll(".crossLink")
                    .data(sortedFinalCrossLinks, function(d) {
                        return d.id;
                    })
                    // Equivalent of d3 v4 selection.raise - https://github.com/d3/d3-selection/blob/master/README.md#selection_raise
                    .each(function() {
                        this.parentNode.appendChild(this);
                    })
                    //.order()
                ;

                if (!highlightOnly) {
                    linkSel.exit().remove();
                    linkSel.enter().append("circle")    // replacing rect
                        .attr("class", "crossLink")
                        .attr("r", xLinkWidth)
                        //.attr("width", xLinkWidth)
                        //.attr("height", yLinkWidth)
                    ;
                }
                //var linkWidthOffset = (linkWidth - 1) / 2;    // for rects
                linkSel
                    .attr("cx", function(d, i) {    // cx/cy for circle, x/y for rect
                        return fromToStore[i][0];// - linkWidthOffset;
                    })
                    .attr("cy", function(d, i) {
                        return (seqLengthB - fromToStore[i][1]);// - linkWidthOffset;
                    })
                    .each (indLinkPlot);
            }
        }

        return this;
    },

    getSizeData: function() {
        // Firefox returns 0 for an svg element's clientWidth/Height, so use zepto/jquery width function instead
        var jqElem = $(this.svg.node());
        var cx = jqElem.width(); //this.svg.node().clientWidth;
        var cy = jqElem.height(); //this.svg.node().clientHeight;
        var width = Math.max(0, cx - this.options.margin.left - this.options.margin.right);
        var height = Math.max(0, cy - this.options.margin.top - this.options.margin.bottom);
        //its going to be square and fit in containing div
        var minDim = Math.min(width, height);

        var sizeData = this.getSeqLengthData();
        $.extend(sizeData, {
            cx: cx,
            cy: cy,
            width: width,
            height: height,
            minDim: minDim,
        });
        return sizeData;
    },

    getSeqLengthData: function() {
        var mObj = this.options.matrixObj;
        var size = mObj ? [mObj.fromProtein.size, mObj.toProtein.size] : [0, 0];
        return {
            lengthA: size[0],
            lengthB: size[1]
        };
    },

    // called when things need repositioned, but not re-rendered from data
    resize: function() {
        console.log("matrix resize");
        var sizeData = this.getSizeData();
        var minDim = sizeData.minDim;

        // fix viewport new size, previously used .attr, but then setting the size on the child canvas element expanded it, some style trumps attr thing
        //var widthRatio = minDim / sizeData.lengthA;
        //var heightRatio = minDim / sizeData.lengthB;
        var widthRatio = sizeData.width / sizeData.lengthA;
        var heightRatio = sizeData.height / sizeData.lengthB;
        var minRatio = Math.min(widthRatio, heightRatio);
        var diffRatio = widthRatio / heightRatio;

        var viewPort = d3.select(this.el).select(".viewport");

        var fx = sizeData.lengthA * minRatio;
        var fy = sizeData.lengthB * minRatio;

        //console.log (sizeData, "rr", widthRatio, heightRatio, minRatio, diffRatio, "FXY", fx, fy);

        viewPort
            .style("width", fx + "px")
            .style("height", fy + "px");

        d3.select(this.el).select("#matrixClip > rect")
            .attr("width", fx)
            .attr("height", fy);

        // Need to rejig x/y scales and d3 translate coordinates if resizing
        // set x/y scales to full domains and current size (range)
        this.x
            .domain([1, sizeData.lengthA + 1])
            .range([0, fx]);

        // y-scale (inverted domain)
        this.y
            .domain([sizeData.lengthB + 1, 1])
            .range([0, fy]);

        // update brush
        this.brush
            .x(this.x.copy().range(this.x.domain().slice()))
            .y(this.y.copy().range(this.y.domain().slice().reverse()));
        this.zoomGroup.select(".brush").call(this.brush);
        //console.log ("BRUSH", this.brush);

        // make sure brush rectangle is big enough to cover viewport (accommodate for scaling)
        this.zoomGroup.select(".brush rect.background")
            .attr("width", sizeData.lengthA)
            .attr("height", sizeData.lengthB);

        //var approxTicks = Math.round (minDim / 50); // 50px minimum spacing between ticks
        this.xAxis.ticks(Math.round(fx / 50)).outerTickSize(0);
        this.yAxis.ticks(Math.round(fy / 50)).outerTickSize(0);

        // then store the current pan/zoom values
        var curt = this.zoomStatus.translate();
        var curs = this.zoomStatus.scale();

        // reset reference x and y scales in zoomStatus object to be x and y scales above
        this.zoomStatus.x(this.x).y(this.y);

        // modify translate coordinates by change (delta) in display size
        var deltaz = this.last ? (minDim / this.last) : 1;
        //console.log ("deltaz", deltaz);
        this.last = minDim;
        curt[0] *= deltaz;
        curt[1] *= deltaz;
        // feed current pan/zoom values back into zoomStatus object
        // (as setting .x and .y above resets them inside zoomStatus)
        // this adjusts domains of x and y scales
        this.zoomStatus.scale(curs).translate(curt);

        // Basically the point is to readjust the axes when the display space is resized, but preserving their current zoom/pan settings
        // separately from the scaling due to the resizing

        // pan/zoom canvas
        this.panZoom();

        return this;
    },

    // Used to do this just on resize, but rectangular areas mean labels often need re-centred on panning
    repositionLabels: function(sizeData) {
        // reposition labels
        //console.log ("SD", sizeData, this.options.margin);
        var labelCoords = [{
                x: sizeData.right / 2,
                y: sizeData.bottom + this.options.margin.bottom - 5,
                rot: 0
            },
            {
                x: -this.options.margin.left,
                y: sizeData.bottom / 2,
                rot: -90
            },
            {
                x: sizeData.right / 2,
                y: 0,
                rot: 0
            }
        ];
        this.vis.selectAll("g.label text")
            .data(labelCoords)
            .attr("transform", function(d) {
                return "translate(" + d.x + " " + d.y + ") rotate(" + d.rot + ")";
            });
        return this;
    },

    // called when panning and zooming performed
    panZoom: function() {

        var self = this;
        var sizeData = this.getSizeData();

        // rescale and position canvas according to pan/zoom settings and available space
        var scale = this.getOverallScale (sizeData);
        var scaleString = "scale(" + scale + ")";
        var translateString = "translate(" + this.zoomStatus.translate()[0] + "px," + this.zoomStatus.translate()[1] + "px)";
        var translateStringAttr = "translate(" + this.zoomStatus.translate()[0] + "," + this.zoomStatus.translate()[1] + ")";
        var transformStrings = {
            attr: translateStringAttr + " " + scaleString,
            style: translateString + " " + scaleString
        };

        // for some reason using a css transform style on an svg group doesn't play nice in firefox (i.e. wrong positions reported, offsetx/y mangled etc)
        // , so use attr transform instead
        [ /*{elem: d3.select(this.el).select(".mouseMat"), type: "style"},*/ {
            elem: this.zoomGroup,
            type: "attr"
        }].forEach(function(d3sel) {
            if (d3sel.type === "attr") {
                d3sel.elem.attr("transform", transformStrings[d3sel.type])
            } else {
                var tString = transformStrings[d3sel.type];
                ["-ms-transform", "-moz-transform", "-o-transform", "-webkit-transform", "transform"].forEach(function(styleName) {
                    d3sel.elem.style(styleName, tString);
                });
            }
        });

        // If bottom edge of canvas is higher up than bottom of viewport put the x axis beneath it
        var cvs = $(this.canvas.node());
        var viewport = cvs.parent();
        sizeData.viewHeight = $.zepto ? viewport.height() : viewport.outerHeight(true);
        sizeData.viewWidth = $.zepto ? viewport.width() : viewport.outerWidth(true);

        var bottom = sizeData.viewHeight;
        /*Math.min (
                   cvs.position().top + (($.zepto ? cvs.height() : cvs.outerHeight(true)) * scale),
                   sizeData.viewHeight
               ); */
        var right = sizeData.viewWidth;
        /*Math.min (
                   cvs.position().left + (($.zepto ? cvs.width() : cvs.outerWidth(true)) * scale),
                   sizeData.viewWidth
               );*/

        // redraw axes
        this.vis.select(".y")
            .call(self.yAxis);

        this.vis.select(".x")
            .attr("transform", "translate(0," + bottom + ")")
            .call(self.xAxis);

        CLMSUI.utils.declutterAxis(this.vis.select(".x"));

        sizeData.bottom = bottom;
        sizeData.right = right;
        this.repositionLabels(sizeData);

        //console.log ("sizeData", sizeData);

        return this;
    },

    identifier: "Matrix View",

    optionsToString: function() {
        var matrixObj = this.options.matrixObj;
        return [matrixObj.fromProtein, matrixObj.toProtein]
            .map(function(protein) {
                return protein.name.replace("_", " ");
            })
            .join("-");
    },
});
