var CLMSUI = CLMSUI || {};
var xiSPEC = xiSPEC || {};

CLMSUI.loadSpectrum = function (match, randId, spectrumModel) {

    var formatted_data = {};

    formatted_data.sequence1 = match.matchedPeptides[0].seq_mods;
    formatted_data.linkPos1 = match.linkPos1 - 1;
    if (match.matchedPeptides[1]) {
        formatted_data.sequence2 = match.matchedPeptides[1].seq_mods;
        formatted_data.linkPos2 = match.linkPos2 - 1;
    }
    formatted_data.crossLinkerModMass = match.crossLinkerModMass()
    formatted_data.modifications = xiSPEC.SpectrumModel.knownModifications;
    formatted_data.precursorCharge = match.precursorCharge;
    formatted_data.fragmentTolerance = match.fragmentTolerance();
    formatted_data.customConfig = CLMSUI.compositeModelInst.get("clmsModel").get("searches").get(match.searchId).customsettings.split('\n');

    var ions = match.ionTypes();
    formatted_data.ionTypes = ions.map(function(ion){ return ion.type.replace("Ion", "")}).join(';')
    formatted_data.precursorMZ = match.expMZ();
    formatted_data.requestID = match.id;

    console.log("loadSpectrum match:" + match.id);

    //TODO: ignoreResultUnlessLastRequested reimplementation
    d3.text ('../CLMS-model/php/peakList.php?sid='+match.searchId+'-'+randId+'&spid='+match.spectrumId, function(error, text) {
            if (error) {
                console.log ("error getting peak list", error);
            } else {
            	d3.select("#range-error").text ("");
                formatted_data.peakList = JSON.parse(text).map(function(p){ return [p.mz, p.intensity]; });
                console.log(formatted_data);
                xiSPEC.setData(formatted_data);
            }
    });

};
