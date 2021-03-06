var CLMSUI = CLMSUI || {};
CLMSUI.linkColour = CLMSUI.linkColour || {};

CLMSUI.BackboneModelTypes.ColourModel = Backbone.Model.extend({
    defaults: {
        title: undefined,
        longDescription: undefined,
        type: "linear",
        fixed: false,
        undefinedColour: "#aaa",
        undefinedLabel: "Unknown",
        unit: "",
    },
    // used by threeColourSliderBB.js
    setDomain: function(newDomain) {
        this.get("colScale").domain(newDomain);
        this.triggerColourModelChanged({
            domain: newDomain
        });
        return this;
    },
    // used by KeyViewBB.changeColour
    setRange: function(newRange) {
        this.get("colScale").range(newRange);
        this.triggerColourModelChanged({
            range: newRange
        });
        return this;
    },
    //used by distogram and scatterplot
    getDomainIndex: function (obj) {    // obj is generally a crosslink, but is non-specific at this point
        const val = this.getValue(obj);
        const dom = this.get("colScale").domain();
        return val != undefined ? (this.get("type") !== "ordinal" ? d3.bisect(dom, val) : dom.indexOf(val)) : undefined;
    },
    //used by scatterplot
    getDomainCount: function() {
        const domain = this.get("colScale").domain();
        return this.isCategorical() ? (this.get("type") === "threshold" ? domain.length + 1 : domain.length) : domain[1] - domain[0] + 1;
    },

    // general entry point - all concrete subclasses must implement getValue(), all also implement initialise
    getColour: function(obj) {  // obj is generally a crosslink, but is non-specific at this point
        const val = this.getValue(obj);
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    },
    getColourByValue: function(val) {
        return val !== undefined ? this.get("colScale")(val) : this.get("undefinedColour");
    },
    // called by setDomain & setRange above
    triggerColourModelChanged: function(changedAttrs) {
        this.trigger("colourModelChanged", this, changedAttrs);
    },
    // used by BaseFrameView.makeChartTitle, scatterplot & distogram
    isCategorical: function() {
        return this.get("type") !== "linear";
    },
    // over-ridden by CLMSUI.BackboneModelTypes.HighestScoreColourModel, called by CLMSUI.utils.updateColourKey & keyViewBB.render
    getLabelColourPairings: function () {
        const colScale = this.get("colScale");
        const labels = this.get("labels").range().concat(this.get("undefinedLabel"));
        const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        const colScaleRange = colScale.range().slice(0, minLength).concat(this.get("undefinedColour"));
        return d3.zip (labels, colScaleRange);
    },
});

CLMSUI.BackboneModelTypes.ColourModelCollection = Backbone.Collection.extend({
    model: CLMSUI.BackboneModelTypes.ColourModel,
});


CLMSUI.linkColour.setupColourModels = function (userConfig) {
    const defaultConfig = {
        default: {domain: [0, 1, 2], range: ["#7570b3", "#d95f02", "#1b9e77"]},
        distance: {domain: [15, 25], range: ['#5AAE61', '#FDB863', '#9970AB']}
    };
    const config = $.extend(true, {}, defaultConfig, userConfig);    // true = deep merging

    CLMSUI.linkColour.defaultColoursBB = new CLMSUI.BackboneModelTypes.DefaultLinkColourModel({
        colScale: d3.scale.ordinal().domain(config.default.domain).range(config.default.range),
        title: "Crosslink Type",
        longDescription: "Default colour scheme, differentiates self links with overlapping peptides.",
        id: "Default"
    });

    const makeGroupColourModel = function () {
        return new CLMSUI.BackboneModelTypes.GroupColourModel({
            title: "Group",
            longDescription: "Differentiate crosslinks by search group when multiple searches are viewed together.",
            id: "Group",
        }, {
            searchMap: CLMSUI.compositeModelInst.get("clmsModel").get("searches"),
        });
    };

    CLMSUI.linkColour.groupColoursBB = makeGroupColourModel();

    CLMSUI.linkColour.interProteinColoursBB = new CLMSUI.BackboneModelTypes.InterProteinColourModel({
        title: "Protein-Protein Colouring",
        longDescription: "Differentiate crosslinks by the proteins they connect. Suitable for 3 to 5 proteins only.",
        id: "InterProtein",
        type: "ordinal"
    }, {
        proteins: CLMSUI.compositeModelInst.get("clmsModel").get("participants")
    });

    CLMSUI.linkColour.distanceColoursBB = new CLMSUI.BackboneModelTypes.DistanceColourModel({
        colScale: d3.scale.threshold().domain(config.distance.domain).range(config.distance.range),
        title: "Distance (Å)",
        longDescription: "Colour crosslinks by adjustable distance category. Requires PDB file to be loaded (via Load -> PDB Data).",
        id: "Distance",
        superDomain: [0, 120], // superdomain is used in conjunction with drawing sliders, it's the maximum that the values in the threshold can be
    });

    //init highest score colour model
    const clmsModel = CLMSUI.compositeModelInst.get("clmsModel"); //todo - shouldn't have this static reference to model here
    const minScore = clmsModel.get("minScore");
    const maxScore = clmsModel.get("maxScore");

    const hiScores = [];
    for (let crosslink of clmsModel.get("crossLinks").values()){
        const scores = crosslink.filteredMatches_pp.map(function(m) {
            return m.match.score();
        });
        hiScores.push(Math.max.apply(Math, scores));
    }

    const hiScoresColScale = d3.scale.quantile()
        .domain(hiScores)
        .range(colorbrewer.PRGn[3]);

    const quantiles = hiScoresColScale.quantiles();

    const range = [minScore, quantiles[0], quantiles[1], maxScore];
    console.log(quantiles, range);

    CLMSUI.linkColour.highestScoreColoursBB = new CLMSUI.BackboneModelTypes.HighestScoreColourModel({
        colScale: d3.scale.threshold().domain(quantiles).range(colorbrewer.Dark2[3].reverse()),
        title: "Highest Score",
        longDescription: "Highest score from supporting matches that meet current filter.",
        id: "HiScores",
        superDomain: [minScore, maxScore], // superdomain is used in conjunction with drawing sliders, it's the maximum that the values in the threshold can be
    });

    const linkColourCollection = new CLMSUI.BackboneModelTypes.ColourModelCollection([
        CLMSUI.linkColour.defaultColoursBB,
        CLMSUI.linkColour.interProteinColoursBB,
        CLMSUI.linkColour.groupColoursBB,
        CLMSUI.linkColour.distanceColoursBB,
        CLMSUI.linkColour.highestScoreColoursBB
    ]);

    // If necessary, swap in newly added colour scale with same id as removed (but current) scale pointed to by linkColourAssignment
    const replaceCurrentLinkColourAssignment = function (collection) {
        const currentColourModel = CLMSUI.compositeModelInst.get("linkColourAssignment");
        if (currentColourModel && !currentColourModel.collection) {
            CLMSUI.compositeModelInst.set("linkColourAssignment", collection.get(currentColourModel.get("id")));
        }
    };

    // Just the group colour scale is replaced for this event
    /*linkColourCollection.listenTo(CLMSUI.compositeModelInst.get("clmsModel"), "change:matches", function() {
        this.remove("Group");   // remove old group scale
        CLMSUI.linkColour.groupColoursBB = makeGroupColourModel();
        this.add (CLMSUI.linkColour.groupColoursBB);    // add new group scale
        replaceCurrentLinkColourAssignment(this);   // replace existing selected scale if necessary
    });*/

    // All colour scales with ids in metadataFields array are removed (if already extant) and new scales added
    linkColourCollection.listenTo(CLMSUI.vent, "linkMetadataUpdated", function(metaMetaData) {
        const columns = metaMetaData.columns;
        const crossLinks = metaMetaData.items;
        const colMaps = columns.map(function (field) {
            return CLMSUI.linkColour.makeColourModel(field, field, crossLinks);
        });
        this.remove(columns);
        this.add(colMaps);
        replaceCurrentLinkColourAssignment(this);
    });

    CLMSUI.linkColour.Collection = linkColourCollection;


    // Protein colour schemes

    CLMSUI.linkColour.defaultProteinColoursBB = new CLMSUI.BackboneModelTypes.DefaultProteinColourModel ({
        colScale: d3.scale.ordinal().domain([0]).range(["#fff"]),
        title: "Default Protein Colour",
        longDescription: "Default protein colour.",
        id: "Default Protein"
    });

    // Can add other metadata-based schemes to this collection later
    const proteinColourCollection = new CLMSUI.BackboneModelTypes.ColourModelCollection([
        CLMSUI.linkColour.defaultProteinColoursBB,
    ]);

    // If necessary, swap in newly added colour scale with same id as removed (but current) scale pointed to by linkColourAssignment
    const replaceCurrentProteinColourAssignment = function (collection) {
        const currentColourModel = CLMSUI.compositeModelInst.get("proteinColourAssignment");
        if (currentColourModel && !currentColourModel.collection) {
            CLMSUI.compositeModelInst.set("proteinColourAssignment", collection.get(currentColourModel.get("id")));
        }
    };

    // All colour scales with ids in metadataFields array are removed (if already extant) and new scales added
    proteinColourCollection.listenTo(CLMSUI.vent, "proteinMetadataUpdated", function(metaMetaData) {
        const columns = metaMetaData.columns;
        const proteins = metaMetaData.items;
        const colMaps = columns.map(function (field) {
            return CLMSUI.linkColour.makeColourModel(field, field, proteins);
        });
        this.remove(columns);
        this.add(colMaps);
        replaceCurrentProteinColourAssignment(this);
    });

    CLMSUI.linkColour.ProteinCollection = proteinColourCollection;
};

CLMSUI.linkColour.makeColourModel = function(field, label, objs) {
    let allColors = true, allNumbers = true, min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY;
    const categories = new Set();
    const numbers = [];
    for (let obj of objs.values()) {
        let val = obj.getMeta(field);
        if (val) {
            if (allNumbers && Number.isFinite(val)) {
                if (val < min) {
                    min = val;
                }
                if (val > max) {
                    max = val;
                }
                numbers.push(val);
                allColors = false
            } else {
                allNumbers = false;
                if (val.trim) {
                    val = val.trim();
                }
                categories.add(val);
                if (allColors && !CLMSUI.utils.commonRegexes.hexColour.test(val)) {
                    allColors = false;
                }
            }
        }
    }

    if (allNumbers) {

        const hiScoresColScale = d3.scale.quantile()
            .domain(numbers).range(colorbrewer.PRGn[3]);

        const quantiles = hiScoresColScale.quantiles();

        const range = [min, quantiles[0], quantiles[1], max];
        console.log(quantiles, range);

        return new CLMSUI.BackboneModelTypes.ThresholdColourModel({
            colScale: d3.scale.threshold().domain(quantiles).range(colorbrewer.Dark2[3]),
            title: label || field,
            longDescription: (label || field) + ", " + " data extracted from metadata.",
            id: label,
            field: field,
            superDomain: [min, max], // super domain is used in conjunction with drawing sliders, it's the maximum that the values in the threshold can be
        });

    } else if (allColors) {
        const domain = [], range = [];
        //make weird categorical (using obj.id )
        for (let obj of objs.values()) {
            if (!obj.is_decoy) {
                domain.push(obj.id);
                let val = obj.getMeta(field);
                if (val) {
                    val = val.trim();
                }
                range.push(val);
            }
        }

        return new CLMSUI.BackboneModelTypes.MetaDataHexValuesColourModel({
            colScale: d3.scale.ordinal().domain(domain).range(range),
            id: label,
            title: label || field,
            longDescription: (label || field) + ", " + " data extracted from metadata.",
            field: field,
            type: "ordinal",
        });
    } else {
        // make normal categorical
        const range = ["#4e79a7", "#f28e2c", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab"];

        return new CLMSUI.BackboneModelTypes.MetaDataColourModel({
            colScale: d3.scale.ordinal().domain(Array.from(categories)).range(range),
            id: label,
            title: label || field,
            longDescription: (label || field) + ", " + " data extracted from metadata.",
            field: field,
            type: "ordinal",
        });
    }
};

CLMSUI.BackboneModelTypes.MetaDataHexValuesColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function () {
        this.set("labels", this.get("colScale").copy());
    },
    getValue: function (obj) {  // obj can be anything with a getMeta function - crosslink or, now, proteins
        if (obj.isPPLink) { //} obj.crossLinks) {
            return obj.crossLinks[0].id;
        }
        return obj.id;
    },
});

CLMSUI.BackboneModelTypes.MetaDataColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({
    initialize: function(properties, options) {
        const domain = this.get("colScale").domain();
        this.set("labels", this.get("colScale").copy().range(domain)); //
    },
    getValue: function (obj) {  // obj can be anything with a getMeta function - crosslink or, now, proteins
        if (obj.isPPLink) { //} obj.crossLinks) {
            return obj.crossLinks[0].getMeta(this.get("field"));
        }
        return obj.getMeta(this.get("field"));
    },
});

CLMSUI.BackboneModelTypes.ThresholdColourModel = CLMSUI.BackboneModelTypes.ColourModel.extend({ // todo -code duplication with Highest score col model
    initialize: function () {
        this.set("type", "threshold")
            .set("labels", this.get("colScale").copy().range(["Low", "Mid", "High"]));
    },
    getValue: function (obj) {
        // return obj.getMeta(this.get("field"));

        let scores = [];
        if (obj.isPPLink) { // watch out! proteins also have an att called crossLinks
            for (let crosslink of obj.crossLinks) {
                const val = crosslink.getMeta(this.get("field"));
                if (isFinite(val) && !isNaN(parseFloat(val))) {
                    scores.push(val);
                }
            }
        } else {
            // scores.push(obj.getMeta(this.get("field")));
            const val = obj.getMeta(this.get("field"));
            if (isFinite(val) && !isNaN(parseFloat(val))) {
                scores.push(val);
            }
        }
        const max = Math.max.apply(Math, scores);
        if (isFinite(max)){
            return max;
        } else {
            return undefined;
        }
    },
    getLabelColourPairings: function () {
        const colScale = this.get("colScale");
        const labels = this.get("labels").range().concat(this.get("undefinedLabel"));
        const minLength = Math.min(colScale.range().length, this.get("labels").range().length);  // restrict range used when ordinal scale
        const colScaleRange = colScale.range().slice(0, minLength).concat(this.get("undefinedColour"));
        return d3.zip(labels, colScaleRange);
    },
});
