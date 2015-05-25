Proper indent ([Brackets](https://github.com/adobe/brackets) extension)
=======================================================================

Hack on multiple diverse projects at the same time? Each using different indent? This extension will save you a lot of time switching your Brackets indent settings. It detect and set the indentation according to the indentation used in the current file or will fallback for default configuration.

Features
========

- Supports multiple file types: JavaScript uses special parser, the rest uses generic parser (kudos to @cessen).
- Works well with new preferences system (starting Sprint 36)
- Recognizes minified files

Tech bits
=========

This extension implements a simple parser capable of recognizing JavaScript syntax to the extent needed to capture indentation. The extension is quite performant: it takes around 70-90 milliseconds to complete the entire operation, of which the parser itself takes 1-5 milliseconds and the rest is the preferences and UI update.

Nathan Vegdahl (github: @cessen) added a generic sniffing mechanism for the files which are not JavaScript.

TODO
====

- (?) Support complicated cases and files which do not respect JavaScript syntax
- (?) Support [SmartTabs](http://www.emacswiki.org/SmartTabs). Could require support for smart tabs from Brackets and/or CodeMirror2.

History of changes
==================

v0.0.6
-------
- Get rid of deprecated subscription mechanisms and deprecated events.
- Lint the extension code with both JSLint and JSHint.

v0.0.5
-------
- Generic indent sniffing mechanism implemented by Nathan Vegdahl (github: @cessen)

v0.0.4
-------
- Integration with Brackets preferences management (>= Sprint 36)

v0.0.3
-------
- Fix a bug with not parsing the file on opening

v0.0.2
-------
- Recognize minified files
- Parser improvements

v0.0.1
-------
- Initial implementation 

Author
======
Arzhan "kai" Kinzhalin

License
=======
MIT, see LICENSE file for details
