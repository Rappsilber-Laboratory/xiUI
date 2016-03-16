<?php

//  CLMS-UI
//  Copyright 2015 Colin Combe, Rappsilber Laboratory, Edinburgh University
//
//  This file is part of CLMS-UI.
//
//  CLMS-UI is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  CLMS-UI is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with CLMS-UI.  If not, see <http://www.gnu.org/licenses/>.

	$sid = urldecode($_GET["sid"]);
	$id_rands = explode("," , $sid);
	$sid = str_replace(',','', $sid );
	$sid = str_replace('-','', $sid );
	
	$showDecoys = false;//urldecode($_GET["decoys"]);
	$showAll = false;//urldecode($_GET["all"]);

	//~ echo "// decoys?:".$showDecoys."\n";
	//~ echo "// all?:".$showAll."\n";

	$pattern = '/[^0-9,\-]/';
	if (preg_match($pattern, $sid)){
		header();
		echo ("<!DOCTYPE html>\n<html><head></head><body>Numbers only for group ids</body></html>");
		exit;
	}

	include('../connectionString.php');
	$dbconn = pg_connect($connectionString) or die('Could not connect: ' . pg_last_error());

	$search_randGroup = [];
	
	for ($i = 0; $i < count($id_rands); $i++) {
		$s = [];		
		$dashSeperated = explode("-" , $id_rands[$i]);
		$randId = implode('-' , array_slice($dashSeperated, 1 , 4));
		$id = $dashSeperated[0];
		$res = pg_query("SELECT search.name, sequence_file.file_name"
					." FROM search, search_sequencedb, sequence_file "
					."WHERE search.id = search_sequencedb.search_id "
					."AND search_sequencedb.seqdb_id = sequence_file.id "
					."AND search.id = '".$id."';") 
					or die('Query failed: ' . pg_last_error());
		$line = pg_fetch_array($res, null, PGSQL_ASSOC);
		$name = $line['name'];
		$filename = $line['file_name'];
		
		$s["id"] = $id;
		$s["randId"] = $randId;
		$s["name"] = $name;
		$s["filename"] = $filename;
		if (count($dashSeperated[5]) == 6) $s["group"] = $dashSeperated[5];
		$search_randGroup[$id] = $s;

	}
	$searchMeta = "var searchMeta = " . json_encode($search_randGroup) . ';';
	
	
	
	
	echo "CLMSUI.sid = '".$sid."';\n";// TODO - this needs to change
	
	echo $searchMeta;
	
	if ($filename == "HSA-Active.FASTA"){
		echo "var HSA_Active = true;\n";
		include('./php/distances.php');
	}
	else {
		echo "var HSA_Active = false;\n";
		echo "var distances = [];\n";
	}
	$peptidesTempTableName = 'tempMatchedPeptides' . preg_replace('/(.|:)/', "_", $_SERVER['REMOTE_ADDR']) . '_' . time();
	$proteinTempTableName = 'tempHasProtein'.preg_replace('/(.|:)/', "_", $_SERVER['REMOTE_ADDR']).time();
	/*$q_makeTempHasProtein =
		'SELECT has_protein.peptide_id, has_protein.protein_id, (peptide_position + 1) as peptide_position INTO TEMPORARY '
		. $proteinTempTableName
		. ' FROM has_protein, ' . $peptidesTempTableName
		. ' WHERE ' . $peptidesTempTableName
		. '.peptide_id = has_protein.peptide_id GROUP BY  has_protein.peptide_id, has_protein.protein_id, peptide_position;';*/
	echo "storedLayout = null;\n";
	
	/*if (false){//strpos($sid,',') === false) { //if not aggregation of more than one search

		$dashPos = strpos($sid,'-');
		$randId = substr($sid, $dashPos + 1);
		$id = substr($sid, 0, ($dashPos));*/
	if (count($search_randGroup) == 1) {
		$layoutQuery = "SELECT t1.layout AS l "
				. " FROM layouts AS t1 "
				. " LEFT OUTER JOIN layouts AS t2 "
				. " ON (t1.search_id = t2.search_id AND t1.time < t2.time) "
				. " WHERE t1.search_id LIKE '" . $sid . "' AND t2.search_id IS NULL;";
		echo "\n\n//l:".$layoutQuery."\n\n";
		$layoutResult = $res = pg_query($layoutQuery) or die('Query failed: ' . pg_last_error());
		while ($line = pg_fetch_array($layoutResult, null, PGSQL_ASSOC)) {
			
			echo "storedLayout = " . stripslashes($line["l"]) . ";\n";
			
		}
	}
/*
		$q_makeTempMatchedPeptides =
			'SELECT matched_peptide.match_id, spectrum_match.score,'
			. ' matched_peptide.match_type,  matched_peptide.peptide_id, matched_peptide.link_position + 1 AS link_position, '
			. ' spectrum_match.autovalidated, '
			. ($showAll ?
					'CASE WHEN spectrum_match.validated IS NULL THEN \'?\' ELSE spectrum_match.validated  END AS validated, '
					: 'spectrum_match.validated, ')
			. ' spectrum_match.search_id, v_export_materialized.scan_number, v_export_materialized.run_name, peptide.sequence AS pepseq  INTO TEMPORARY '
			. $peptidesTempTableName
			. ' FROM '
			. '  matched_peptide inner join '
			. ' (SELECT * FROM spectrum_match WHERE SEARCH_ID = '.$id . ' AND dynamic_rank = true'
			. ($showDecoys ? '' : ' AND spectrum_match.is_decoy != true')
			. ($showAll ? ' AND spectrum_match.score > 1' : ' AND ((spectrum_match.autovalidated = true AND (spectrum_match.rejected != true  OR spectrum_match.rejected is null)) OR'
			. ' (spectrum_match.validated LIKE \'A\') OR (spectrum_match.validated LIKE \'B\') OR (spectrum_match.validated LIKE \'C\')  '
			. ' OR (spectrum_match.validated LIKE \'?\'))')
			. ' ) spectrum_match ON spectrum_match.id = matched_peptide.match_id '
			. ' inner join  peptide ON  matched_peptide.peptide_id = peptide.id '
			. ' inner join search ON spectrum_match.search_id = search.id '
			. ' inner join v_export_materialized ON spectrum_match.id = v_export_materialized.spectrum_match_id '
			. ' WHERE search.random_id = \''.$randId.'\''
			. ' AND matched_peptide.link_position != -1;';

		echo "\n//Query:".$q_makeTempMatchedPeptides;

		$q_makeTempHasProtein =
			'SELECT has_protein.peptide_id, has_protein.protein_id, (peptide_position + 1) as peptide_position INTO TEMPORARY '
			. $proteinTempTableName
			. ' FROM has_protein, ' . $peptidesTempTableName
			. ' WHERE ' . $peptidesTempTableName
			. '.peptide_id = has_protein.peptide_id GROUP BY  has_protein.peptide_id, has_protein.protein_id, peptide_position;';

		$q_hasProtein = 'SELECT peptide_id, array_to_string(array_agg(protein_id), \',\') as proteins, array_to_string(array_agg(peptide_position), \',\') as positions FROM '
				. $proteinTempTableName . ' GROUP BY '. $proteinTempTableName .'.peptide_id';

	// turns out that array_agg()[1] is quicker than the (SQL script created) first() function
	$q_proteins = 'SELECT protein.id, (array_agg(protein.name))[1] AS name, (array_agg(protein.description))[1] AS description, (array_agg(protein.sequence))[1] AS sequence, (array_agg(protein.protein_length))[1] AS size, (array_agg(protein.accession_number))[1] AS accession'
		  .' FROM protein, '
		  .	$proteinTempTableName . ' WHERE ' . $proteinTempTableName
		  .'.protein_id = protein.id  GROUP BY protein.id;';
	}
	else { //its an aggregation of more than one search
*/	
		$WHERE = ' ';
		//TODO - get rid of this ref to v_export_materialized, its being used to get scan number/run_name
		$WHERE_VE = ' '; // v_export_materialized
		$c = 0;
		for ($i = 0; $i < count($search_randGroup); $i++) {
			$search = array_values($search_randGroup)[$i];
			if ($c > 0){
				$WHERE = $WHERE.' OR ';
				$WHERE_VE = $WHERE_VE.' OR ';
			}
			$c++;
			$randId = $search["randId"];//substr($agg, $dashPos + 1);
			$id = $search["id"];//substr($agg, 0, ($dashPos));
			//echo '// s' . $id . ' ' . (string)$search;
			$WHERE = $WHERE.'(sm.search_id = '.$id.' AND s.random_id = \''.$randId.'\''.') ';
			$WHERE_VE = $WHERE_VE.'(search_id = '.$id.')';
		}

		$q_makeTempMatchedPeptides =
			'SELECT matched_peptide.match_id, sm.score,'
			. ' matched_peptide.match_type,  matched_peptide.peptide_id, matched_peptide.link_position + 1 AS link_position, '
			. ' sm.autovalidated, sm.validated, '
			. ' sm.search_id, v_export_materialized.scan_number, v_export_materialized.run_name, peptide.sequence AS pepseq  INTO TEMPORARY '
			. $peptidesTempTableName
			. ' FROM '
			. '  matched_peptide inner join '
			. ' (SELECT sm.* FROM spectrum_match sm INNER JOIN search s ON sm.search_id = s.id WHERE ('.$WHERE.') AND dynamic_rank = true AND sm.is_decoy != true'
			. ' AND ((sm.autovalidated = true AND (sm.rejected != true  OR sm.rejected is null)) OR'
			. ' (sm.validated LIKE \'A\') OR (sm.validated LIKE \'B\') OR (sm.validated LIKE \'C\')  '
			. ' OR (sm.validated LIKE \'?\')) ) sm ON sm.id = matched_peptide.match_id '
			. ' inner join  peptide ON  matched_peptide.peptide_id = peptide.id '
			. ' inner join (SELECT * from  v_export_materialized WHERE ('.$WHERE_VE.') AND dynamic_rank = true AND is_decoy != true )  v_export_materialized ON sm.id = v_export_materialized.spectrum_match_id '
			. ' WHERE  matched_peptide.link_position != -1;';

		$q_makeTempHasProtein = 'SELECT has_protein.peptide_id, has_protein.protein_id, (peptide_position + 1) as peptide_position, (array_agg(protein.accession_number))[1] as accession  INTO TEMPORARY ' .
				$proteinTempTableName . ' FROM has_protein, '
				. $peptidesTempTableName .', protein'
				.' WHERE ' . $peptidesTempTableName
				.'.peptide_id = has_protein.peptide_id AND has_protein.protein_id = protein.id GROUP BY has_protein.peptide_id, has_protein.protein_id, peptide_position;';

		$q_hasProtein = 'SELECT peptide_id, array_to_string(array_agg(accession), \',\') as proteins, array_to_string(array_agg(peptide_position), \',\') as positions FROM '
				. $proteinTempTableName . ' GROUP BY '. $proteinTempTableName .'.peptide_id';
		// turns out that array_agg()[1] is quicker than the (SQL script created) first() function
		$q_proteins = 'SELECT protein.accession_number as id, (array_agg(protein.name))[1] AS name, (array_agg(protein.description))[1] AS description, (array_agg(protein.sequence))[1] AS sequence, (array_agg(protein.protein_length))[1] AS size, (array_agg(protein.accession_number))[1] AS accession'
			  .' FROM protein, '
			  .	$proteinTempTableName . ' WHERE ' . $proteinTempTableName
			  .'.protein_id = protein.id  GROUP BY protein.accession_number;';
	/*}*/


	echo '//q_makeTempMatchedPeptides>'.$q_makeTempMatchedPeptides."\n";
	$res = pg_query($q_makeTempMatchedPeptides) or die('Query failed: ' . pg_last_error());
	$res = pg_query($q_makeTempHasProtein) or die('Query failed: ' . pg_last_error());

	$res = pg_query($q_proteins) or die('Query failed: ' . pg_last_error());
	$line = pg_fetch_array($res, null, PGSQL_ASSOC);

	echo "\nvar tempInteractors = [";

	while ($line) {
		//may or may not have enclosing single quotes in DB. We need them.
		$seq = $line["sequence"];
		if (substr($seq, 0, 1) != "'") {
			$seq = "'" . $seq . "'";
		}

		$name = str_replace(")", "", str_replace("(", "", str_replace("'", "", $line["name"])));
		//~ $underscore_pos = strpos($name,'_');
		//~ $name = substr($name, 0, $underscore_pos); //removes e.g. '_HUMAN' from end of names

		$pid = $line["id"];
		if (strpos($sid,',') !== false) { //if aggregation
			$pid = $line["accession"];
		}

		echo '['
				. '\''.$pid . '\','
				. '\'' . str_replace("'", "", $line["accession"]) . '\','
				. '\'' . $name . "',"
				. $seq
				. "]";
		$line = pg_fetch_array($res, null, PGSQL_ASSOC);
		if ($line) { echo ','; }
		echo "\n";
	}
	echo "];\n";

	$q_matchedPeptides = 'SELECT '. $peptidesTempTableName .'.*, proteins, positions FROM '
			.$peptidesTempTableName . ', ('	.$q_hasProtein.') AS prt WHERE '
			. $peptidesTempTableName .'.peptide_id = prt.peptide_id ORDER BY score DESC, match_id, match_type;';
	//~ echo '//q_matchedPeptides>'.$q_matchedPeptides."\n";
	$res = pg_query($q_matchedPeptides) or die('Query failed: ' . pg_last_error());
	echo "var tempMatches = [";
	$waitingForFirstMatch = true;
	//~ $line = pg_fetch_array($res, null, PGSQL_ASSOC);
	while ($line = pg_fetch_array($res, null, PGSQL_ASSOC)) {
		$match_type = $line["match_type"];
		if ($match_type == 1) {
			$match_id = $line["match_id"];
			$match_score = $line["score"];
			$match_autovalidated = '"'.$line["autovalidated"].'"';
			$match_validated = '"'.$line["validated"].'"';
			$search_id = $line["search_id"];
			$scan_number = '"' . $line["scan_number"]. '"';

			$pep1_link_position = $line['link_position'];
			$pep1_positions = '[' . $line["positions"] . ']';
			$pep1_prot_ids = '"' . $line["proteins"] . '"';
			$pep1_seq =  '"' . $line["pepseq"] . '"';
			$waitingForFirstMatch = false;
		} else if ($match_type == 2) {
			if ($match_id == $line["match_id"]) {
				$pep2_link_position = $line['link_position'];
				$pep2_positions = '[' . $line["positions"] . ']';
				$pep2_prot_ids = '"' . $line["proteins"] . '"';
				$pep2_seq =  '"' . $line["pepseq"] . '"';

				$search = $search_randGroup[$search_id];
				$group = $search["group"];
				$run_name = '"' . $line["run_name"]. '"';
			
				if ($waitingForFirstMatch != true) {
					echo "["//"xlv.addMatch("
								. $match_id . ','
								. $pep1_prot_ids . ','
								. $pep1_positions . ','
								. $pep1_seq . ','
								. $pep1_link_position. ','
								. $pep2_prot_ids . ','
								. $pep2_positions . ','
								. $pep2_seq . ','
								. $pep2_link_position. ','
								. $match_score . ','
								. $search_id . ','
								. $match_autovalidated . ','
								. $match_validated . ','
								. $run_name . ','
								. $scan_number. ','
								. $group
								. "]";
					//~ $line = pg_fetch_array($res, null, PGSQL_ASSOC);
					//~ if ($line)
					 {echo ',';} // that last comma should be removed
					$waitingForFirstMatch = true;
				}
			}
		}
	}
	echo "];\n";

	// Free resultset
	pg_free_result($res);
	// Closing connection
	pg_close($dbconn);
?>
