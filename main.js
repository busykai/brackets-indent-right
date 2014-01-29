/*
 * Copyright (c) 2014 Arzhan "kai" Kinzhalin
 * 
 * See the file LICENSE for copying permission.
 */
/* global console */
define(function (require, exports, module) {
    "use strict";
    var AppInit                 = brackets.getModule("utils/AppInit"),
        Document                = brackets.getModule("document/Document"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        PerfUtils               = brackets.getModule("utils/PerfUtils"),
        PreferencesBase         = brackets.getModule("preferences/PreferencesBase"),
        PreferencesManager      = brackets.getModule("preferences/PreferencesManager"),
        ProjectManager          = brackets.getModule("project/ProjectManager"),
        Strings                 = brackets.getModule("strings"),
        
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
     * Detects the indentation type used in the file. SAMPLE_LINES_NO is taken from the beginning of the file.
     * Indentation at the global scope is ignored.
     */
    function sniff(doc) {
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
        
        if (!doc || doc.getLanguage().getName() !== "JavaScript") {
            resetPrefs();
            return;
        }
        if ((indent = sniff(doc))) {
        
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
