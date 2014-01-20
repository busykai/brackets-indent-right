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
        
        /* Minimal number of lines to be sampled. Only code lines will be sampled. */
        MIN_LINE_COUNT          = 20;
    /**
     *
     */
        function sniff(document) {
        var doc = document || DocumentManager.getCurrentDocument();
            text = doc.getText(),
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
                    if (!inBlockComment && !inExpression && nestLevel) {
                        samples++;
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
            if (i > length || samples > MIN_LINE_COUNT) {
                break;
            }
        }
    }
    
    /**
     * 
     */
    function set(indent) {
        
    }
    
    AppInit.appReady(function () {
        $(DocumentManager)
            .on("documentRefreshed.indent-right", function(e, doc) {
                var indent;
                if ((indent = sniff(doc))) {
                    set(indent);
                }
            });
    });
});
