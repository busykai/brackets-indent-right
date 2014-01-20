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
        Strings                 = brackets.getModule("strings"),
        
        /* Number of lines to be sampled. Only code lines will be sampled. */
        SAMPLE_LINES_NO         = 20,
    
        /* IDs of the status bar elements. */
        INDENT_TYPE             = "indent-type",
        INDENT_WIDTH            = "indent-width-input";
        
        
    /**
     * Detects the indentation type used in the file. Samples MIn
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
            spaceCount      = 0,
            lineNo          = 1,
            samples         = 0,
            map             = {},
            newLine         = true;
        
        // settings
        var leaveDefaultIfNotCertain = true;
        
        while (true) {
            prevc = currc;
            currc = text[i];

            if (newLine && (currc !== ' ' && currc !== '\t')) {
                newLine = false;
            }
            switch (currc) {
                case '/':
                    if (inBlockComment && prevc === '*') {
                        inBlockComment = false;
                    } else if (!inBlockComment && prevc === '/') {
                        inLineComment = true;
                    }
                    break;
                case '*':
                    if (prevc === '/') {
                        inBlockComment = true;
                    }
                    break;
                case '\n':
                    inLineComment = false;
                    lineNo++;
                    newLine = true;
                    if (spaceCount > 0) {
                        spaceCount = 0;
                    } else {
                        if (!inBlockComment && !inExpression && nestLevel) {
                            samples++;
                        }
                    }
                    break;
                case '{':
                    if (!inBlockComment && !inLineComment) {
                        nestLevel++;
                        inExpression = false;
                    }
                    break;
                case '}':
                    if (!inBlockComment && !inLineComment) {
                        nestLevel--;
                        inExpression = false;
                    }
                    break;
                case ' ':
                case '\t':
                    if (newLine && !inExpression && !inBlockComment) {
                        spaceCount++;
                    }
                    break;
                case ';':
                    if (!inBlockComment && !inLineComment) {
                        inExpression = false;
                    }
                    break;
                default:
                    if (!inExpression) {
                        inExpression = true;
                    }
                    break;
            }
            if (spaceCount > 0 && (currc !== ' ' && currc !== '\t')) {
                var spacePerIndent = (nestLevel) ? Math.floor(spaceCount / nestLevel) : spaceCount,
                    key,
                    indentCharName;

                if (prevc === " ") {
                    indentCharName = "space";
                } else if (prevc === '\t') {
                    indentCharName = "tab";
                } else {
                    // this is an error condition
                    console.log("Parse internal error. prevc = '" + prevc + "' and currc = '" + currc + "'");
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
                console.warn("Line " + lineNo + " result is " + key);
                spaceCount = 0;
            }
            i++;
            if (i > length || samples > SAMPLE_LINES_NO) {
                break;
            }
        } /* while */
        for (var k in map) {
            if (map[k].samples > samples * 0.7) {
                return map[k];
            }
        }
        return null;
    }
    
    /**
     * 
     */
    function set(indent) {
        var $indentType,
            $indentWidth;
        
        $indentType     = $("#" + INDENT_TYPE);
        $indentWidth    = $("#" + INDENT_WIDTH);
        
        if ($indentType.text() === Strings.STATUSBAR_SPACES) {
            if (indent.char === '\t') {
                $indentType.trigger("click");
            }
        } else if ($indentType.text() === Strings.STATUSBAR_TAB_SIZE) {
            if (indent.char === ' ') {
                $indentType.trigger("click");
            }
        }
        
        if (indent.char === ' ') {
            $indentWidth.val(indent.indent);
            $indentWidth.trigger("blur");
        }
        
    }
    
    function run(input) {
        var doc = input || DocumentManager.getCurrentDocument(),
            indent;
        if ((indent = sniff(doc))) {
            set(indent);
        }
    }
    
    AppInit.appReady(function () {
        $(DocumentManager)
            .on("documentRefreshed.indent-right documentSaved.indent-right", function(e, doc) {
                run(doc);
            })
            .on("currentDocumentChange.indent-right", function(e) {
                run();
            });
    });
});
