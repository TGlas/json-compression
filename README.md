# JSON Compression

This small library provides two Javascript (ECMAScript 6) functions for
compressing and decompressing JSON data to and from strings:

 * `compressJson(data)` is analogous to `JSON.stringify(data)`.
 * `decompressJson(str)` is analogous to `JSON.parse(str)` applied to the result of `compressJson`.

The resulting string is *not* human-readable, but usually significantly
shorter than the result of `JSON.stringify`. It uses only the printable
ASCII range, and it is suitable for use as a double-quoted string
literal in Javascript code.

Compression of string literals is somewhat tailored towards the
printable ASCII range, assuming that these characters are most common.
The complete unicode range is supported, but if the JSON data includes
longer string segments written in non-ASCII scripts then the compression
ratio may suffer.

## Example

	const data = {
		description: "Some random test data with non-ASCII characters: \u00c9 \u03A9 \u{1F6DD}",
		values: [1, 2, 4, 8, 1024, 1048576, 1e100, -50, 3.14, 3.14159265358979],
		points: [{x: 1, y: 2}, {x: 44, y: -55.5}, {x: -2, y: -77}, {x: 0, y: 0, z: 11}],
		active: true,
		owner: null,
	};
	console.log("original data:", data);

	const compressed = compressJson(data);
	console.log("compressed string:", '"' + compressed + '"');
	// ",-|GUWYfuO>#t'M>?):~szw,K&[g8nW3Pfv6{o(60*'u71g7sinm*meS!28k`6wA$&w>;
	//  (D^n;H_BK@Nr_O+)?YE0R_')]o,=2QK?T-]_;nS=T`)^#.V2vM>>28%|(D9O-_Yc,Jas`
	//  NQ^!!!!,oBFEd0Ui<GO%72T99q{?9^*kCu??J$#G[XfgvCpFA$c'Q9/"

	const recovered = decompressJson(compressed);
	console.log("decompressed data:", recovered);   // reproduces the original data

## Copyright and License

Copyright (c) 2023 Tobias Glasmachers.
The code is published under an MIT license. Refer to the LICENSE file for details.
