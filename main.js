/*
 * Copyright (c) 2014 Arzhan "kai" Kinzhalin
 * 
 * See the file LICENSE for copying permission.
 */
/* global console */
define(function (require, exports, module) {
    "use strict";
    var AppInit                 = brackets.getModule("utils/AppInit"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        PerfUtils               = brackets.getModule("utils/PerfUtils"),
        PreferencesManager      = brackets.getModule("preferences/PreferencesManager"),
        
        /* Number of lines to be sampled. Only code lines which must follow certain indent will be sampled. */
        SAMPLE_LINES_NO         = 20,
    
        /* IDs of the status bar elements. */
        INDENT_TYPE             = "indent-type",
        INDENT_WIDTH            = "indent-width-input",
        INDENT_WIDTH_LABEL      = "indent-width-label";
    
    var _prefLocation = {
        location: {
            scope: "session"
        }
    };
        
    /**
     * Detects the indentation type used in a javascript file. SAMPLE_LINES_NO is taken from the beginning of the file.
     * Indentation at the global scope is ignored.
     */
    function sniff_javascript(doc) {
        var text = doc.getText(),
            length = text.length,
            i = 0,
            line = 1;
        
        // parser states
        var prevc           = '\n', // previous character
            currc           = '\n', // current character
            inBlockComment  = false,
            inLineComment   = false,
            inExpression    = false,
            nestLevel       = 0,
            spaceCount      = 0,    // spaces at the beginning of the line
            charCount       = 0,    // total characters in the line
            lineNo          = 1,
            samples         = 0,
            map             = {},
            newLine         = true,
            suspectMinified = 0,
            prevIndent;             // last indent successfully detected or null
        
        // settings
        var leaveDefaultIfNotCertain = true;
        
        var sniffingTimer = PerfUtils.markStart("Indent sniffing:\t" + doc.file.fullPath);
        
        while (true) {
            prevc = currc;
            currc = text[i];

            /* do not count spaces if a line begins with a non-space */
            if (newLine && (currc !== ' ' && currc !== '\t')) {
                newLine = false;
            }

            charCount++;

            switch (currc) {
                /* possible beginning or ending of a block comment or beginning
                 * of a line comment */
                case '/':
                    if (inBlockComment && prevc === '*') {
                        inBlockComment = false;
                    } else if (!inBlockComment && prevc === '/') {
                        inLineComment = true;
                    }
                    break;
                /* possible begining of a comment */
                case '*':
                    if (prevc === '/') {
                        inBlockComment = true;
                    }
                    break;
                /* new line, number of things happen. */
                case '\n':
                    if (spaceCount === 0 && charCount > 300) {
                        // suspect minified file a couple of lines like it and we're done
                        suspectMinified++;
                    } else {
                        // stop being suspicious if it seems to be a reasonable line
                        suspectMinified = 0;
                    }
                    if (spaceCount > 0) {
                        spaceCount = 0;
                    }
                    charCount = 0;
                    inLineComment = false;
                    lineNo++;
                    newLine = true;

                    break;
                /* new scope -- important for the indent */
                case '{':
                    if (!inBlockComment && !inLineComment) {
                        nestLevel++;
                        inExpression = false;
                    }
                    break;
                /* closing scope */
                case '}':
                    if (!inBlockComment && !inLineComment) {
                        nestLevel--;
                        inExpression = false;
                    }
                    break;
                /* indents itself */
                case ' ':
                case '\t':
                    if (newLine && !inExpression && !inBlockComment) {
                        spaceCount++;
                    }
                    break;
                /* expression terminator */
                case ';':
                    if (!inBlockComment && !inLineComment) {
                        inExpression = false;
                    }
                    break;
                /* all the other character, including non-treated whitespaces
                 * are stupidly considered whitespaces
                 */
                default:
                    if (!inExpression && !inBlockComment && !inLineComment) {
                        inExpression = true;
                    }
                    if (charCount > 1024) {
                        suspectMinified = 2; /* needs to be more than 1 to stop */
                    }
                    break;
            }
            /* see if we need to reasonably stop. */
            if (nestLevel < 0) {
                /* parser is completely lost -- give up */
                console.log("Proper Indent: parser got lost (because it's not a parser)");
                map = {};
                break;
            }
            if (suspectMinified > 1) {
                /* two successive suspicious lines -- assume minified */
                console.log("Proper Indent: not detecting indents in minified files");
                map = {};
                break;
            }
            
            /* see if we got somewhere */
            if (spaceCount > 0 && (currc !== ' ' && currc !== '\t')) {
                var spacePerIndent = (nestLevel) ? Math.floor(spaceCount / nestLevel) : spaceCount,
                    key,
                    indentCharName,
                    effectiveScope;
                
                /* if the indent is not the same as the previously detected, try to
                 * account for special cases tweak the scope back and forth, but do
                 * not parse the language. */
                if (prevc === ' ' && prevIndent && spacePerIndent !== prevIndent.indent) {
                    var altSpacesPerIndent = (nestLevel - 1 > 0) ? Math.floor(spaceCount/nestLevel-1) : spaceCount;
                    if (altSpacesPerIndent === prevIndent.indent) {
                        spacePerIndent = altSpacesPerIndent;
                        effectiveScope = nestLevel - 1;
                    } else {
                        altSpacesPerIndent = Math.floor(spaceCount/(nestLevel+1));
                        if (altSpacesPerIndent === prevIndent.indent) {
                            spacePerIndent = altSpacesPerIndent;
                            effectiveScope = nestLevel + 1;
                        }
                    }
                } else {
                    effectiveScope = nestLevel;
                }
                
                /* got ourselves a sample */
                if (effectiveScope > 0 && spacePerIndent > 0) {
                    samples++;
                    if (prevc === " ") {
                        indentCharName = "space";
                    } else if (prevc === '\t') {
                        indentCharName = "tab";
                    } else {
                        // this is an error condition
                        console.error("Proper Indent: parse internal error. prevc = '" + prevc + "' and currc = '" + currc + "'");
                    }
                    
                    key = indentCharName + spacePerIndent;
                    
                    if (map[key] === undefined) {
                        map[key] = {
                            'char': prevc,
                            'indent': spacePerIndent,
                            'samples': 1
                        };
                    } else {
                        map[key].samples++;
                    }
                    spaceCount = 0;
                    prevIndent = map[key];
                }
            }
            i++;
            if (i > length || samples === SAMPLE_LINES_NO) {
                break;
            }
        } /* while */
        
        /* analyze the results. */
        for (var k in map) {
            if (map[k].samples > samples * 0.7) {
                PerfUtils.addMeasurement(sniffingTimer);
                return map[k];
            }
        }
        
        PerfUtils.addMeasurement(sniffingTimer);
        return null;
    }
    
    /**
     * Detects the indentation type used in a generic file. SAMPLE_LINES_NO is
     * taken from the beginning of the file.
     */
    function sniff_generic(doc) {
        var text = doc.getText(),
            length = text.length,
            i = 0,
            sampledLines = 0,
            prevIndent = "",
            line = [],
            spaceDiff = 0;
        
        /* statistics-gathering variables. */
        var tabLines = 0,
            spaceLines = 0,
            spaceCounts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0};
        
        /**
         * Fetches the next line, split into indentation and the text after
         * the indentation.
         */
        function get_indent_line() {
            var indentation = "",
                post_indentation = "";
            
            /* end of document, abort. */
            if (i >= length) {
                return null;
            }
            
            /* get indentation of the current line.  Indentation in this
             * case is defined as matching leading whitespace characters.
             * So, for example, two tabs followed by three spaces counts
             * as two tabs of indentation--the three spaces are ignored.
             */
            if (text[i] === " ") {
                // line is indented with spaces
                while (i < length && text[i] === " ") {
                    indentation += " ";
                    i++;
                }
            } else if (text[i] === "\t") {
                // line is indented with tabs
                while (i < length && text[i] === "\t") {
                    indentation += "\t";
                    i++;
                }
            }
            
            /* eat remaining whitespace. */
            while (i < length && (text[i] === " " || text[i] === "\t")) {
                i++;
            }

            /* get the rest of the line. */
            while (i < length && sampledLines < SAMPLE_LINES_NO) {
                if (text[i] === "\n") {
                    i++;
                    break;
                } else {
                    post_indentation += text[i];
                    i++;
                }
            }
            
            return [indentation, post_indentation];
        }
        
        var sniffingTimer = PerfUtils.markStart("Indent sniffing:\t" + doc.file.fullPath);
        
        /* collect statistics. */
        while (i < length) {
            line = get_indent_line();
            
            /* skip lines with the same indentation as previous line,
             * and skip lines that are only whitespace. */
            if (line[0] === prevIndent || line[1] === "") {
                continue;
            }
            
            if (line[0][0] === "\t") {
                if ((line[0].length - prevIndent.length) > 0) {
                    /* if the line starts with a tab, and it's an indentation
                     * increase, record it as tab indent. */
                    sampledLines++;
                    tabLines++;
                }
            } else {
                spaceDiff = line[0].length - prevIndent.length;
                if (spaceDiff > 0) {
                    /* if the line starts with a space, determine the
                     * indentation increase over the previous line, if any,
                     * and record it. */
                    sampledLines++;
                    spaceLines++;
                    spaceCounts[spaceDiff]++;
                }
            }
            
            prevIndent = line[0];
        }
        
        // Analyze the results.
        var result = {'char': '', 'indent': 0, 'samples': 0};
        if (tabLines > 0 || spaceLines > 0) {
            if ((tabLines * 2) > spaceLines) { // heuristic: the presence of lines starting with tabs is a stronger indication, so weight it double
                result.char = '\t';
                result.samples = tabLines;
            }
            else {
                for (var ii = 1; ii <= 8; ii++) {
                    if (spaceCounts[ii] > result.samples) {
                        result.char = ' ';
                        result.indent = ii;
                        result.samples = spaceCounts[ii];
                    }
                }
            }

            PerfUtils.addMeasurement(sniffingTimer);
            return result;
        }

        PerfUtils.addMeasurement(sniffingTimer);
        return null;
    }
    
    /**
     * Sets the Brackets indentation settings. Simply manipulate the preferences, the editor
     * will do the rest.
     */
    function set(indent) {
        PreferencesManager.set("useTabChar", (indent.char === '\t' ) ? true : false, _prefLocation);
        if (indent.char === ' ') {
            PreferencesManager.set("spaceUnits", indent.indent, _prefLocation);
        }
    }
    
    function resetPrefs() {
        PreferencesManager.set("spaceUnits", undefined, _prefLocation);
        PreferencesManager.set("useTabChar", undefined, _prefLocation);
    }
    
    /**
     * Runs the analysis under proper conditions.
     */
    function run(input) {
        var doc = input || DocumentManager.getCurrentDocument(),
            indent,
            overallTimer;
        
        if (!doc) {
            return;
        }
        
        overallTimer = PerfUtils.markStart("Proper indent: " + doc.file.fullPath);
        
        if (!doc) {
            resetPrefs();
            return;
        }
        
        /* sniff document's indentation.  Algorithm used depends on language. */
        if (doc.getLanguage().getName() === "JavaScript") {
            indent = sniff_javascript(doc);
        } else {
            indent = sniff_generic(doc);
        }
        
        /* set indentation style. */
        if (indent) {
            set(indent);
        } else {
            resetPrefs();
        }
        
        PerfUtils.addMeasurement(overallTimer);
    }
    
    AppInit.htmlReady(function () {
        $(DocumentManager)
            .on("documentRefreshed.indent-right documentSaved.indent-right", function(e, doc) {
                if (doc === DocumentManager.getCurrentDocument()) {
                    run(doc);
                }
            })
            .on("currentDocumentChange.indent-right", function(e) {
                run();
            });
    });
    
});
