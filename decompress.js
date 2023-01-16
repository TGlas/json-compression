"use strict"

// extract JSON data from a compressed JSON string
function decompressJson(compressed)
{
	// alphabet decoding
	const decode92 = new Uint8Array(128);
	for (let i=0; i<92; i++)
	{
		let code = i + 33;
		if (code >= 34) code++;
		if (code >= 92) code++;
		decode92[code] = i;
	}

	// prepare histograms
	let numHist = new Uint32Array(9);   // histogram for encoding numbers
	for (let i=0; i<8; i++) numHist[i] = 1;
	numHist[8] = 8;
	function createHistogram()
	{
		let h = new Uint32Array(97);
		for (let i=0; i<96; i++) h[i] = 1;
		h[96] = 96;
		return h;
	}
	let stringHistogram = [];           // histograms for encoding strings
	for (let i=0; i<96; i++) stringHistogram.push(createHistogram());
	let strHist = createHistogram();

	// entropy decoding
	let value = 0;
	let range = 1;
	let pos = 0;

	function loadBase(size)
	{
		while (range < 23091221)
		{
			range *= 92;
			value *= 92;
			if (pos < compressed.length) value += decode92[compressed.charCodeAt(pos++)];
		}
		let k = (value * size / range) | 0;
		let l = (k * range / size) | 0;
		let u = ((k+1) * range / size) | 0;
		if (value >= u)
		{
			k++;
			l = u;
			u = ((k+1) * range / size) | 0;
		}
		value -= l;
		range = u - l;
		return k;
	}

	function loadSize()
	{
		let n = 0;
		for (let base=10; ; base*=10)
		{
			let k = loadBase(base);
			if (k < base-1) return n + k;
			n += base-1;
		}
	}

	function loadCategoryH(hist)
	{
		while (range < 23091221)
		{
			range *= 92;
			value *= 92;
			if (pos < compressed.length) value += decode92[compressed.charCodeAt(pos++)];
		}
		let sz = hist.length - 1;
		const n = hist[sz];
		let s = 0;
		let l = 0;
		for (let k=0; k<sz; k++)
		{
			s += hist[k];
			const u = ((range * s / n) | 0);
			if (value < u)
			{
				value -= l;
				range = u - l;
				return k;
			}
			l = u;
		}
	}

	function loadCategoryC(hist)
	{
		while (range < 23091221)
		{
			range *= 92;
			value *= 92;
			if (pos < compressed.length) value += decode92[compressed.charCodeAt(pos++)];
		}
		let sz = hist.length - 1;
		const n = hist[sz];
		for (let k=0; k<sz; k++)
		{
			const l = ((range * hist[k  ] / n) | 0);
			const u = ((range * hist[k+1] / n) | 0);
			if (value < u)
			{
				value -= l;
				range = u - l;
				return k;
			}
		}
	}

	function loadNumber()
	{
		let q = loadCategoryH(numHist);
		numHist[q]++;
		numHist[8]++;
		if (q < 5)
		{
			// integer
			let base = [111, 990000, 9990, 990000, 9900][q];
			let offset = [-10, -1000000, -10000, 10000, 100][q];
			return loadBase(base) + offset;
		}
		else
		{
			// floating point number
			let sign = 2 * loadBase(2) - 1;
			if (q === 5)
			{
				let mantissa = loadBase(1000000);
				let exponent = loadBase(10) - 2;
				const s = ((sign > 0) ? "" : "-") + mantissa + "e" + (exponent-5);
				return parseFloat(s);
			}
			else if (q === 6)
			{
				let mantissa = 1e5*loadBase(100000) + loadBase(100000);
				let exponent = loadBase(32) - 11;
				const s = ((sign > 0) ? "" : "-") + mantissa + "e" + (exponent-9);
				return parseFloat(s);
			}
			else
			{
				let mantissa = 1e11*loadBase(1000000) + 1e5*loadBase(1000000) + loadBase(100000);
				let exponent = loadBase(632) - 323;
				const s = ((sign > 0) ? "" : "-") + mantissa + "e" + (exponent-16);
				return parseFloat(s);
			}
		}
	}

	function loadString()
	{
		let parts = [];
		let codes = [];
		let size = loadSize();
		for (let i=0; i<size; i++)
		{
			while (range < 23091221)
			{
				range *= 92;
				value *= 92;
				if (pos < compressed.length) value += decode92[compressed.charCodeAt(pos++)];
			}
			const n = strHist[96];
			let s = 0;
			let l = 0;
			for (let k=0; k<96; k++)
			{
				s += strHist[k];
				const u = ((range * s / n) | 0);
				if (value < u)
				{
					strHist[k]++;
					strHist[96]++;
					let code = 32 + k;
					value -= l;
					range = u - l;
					strHist = stringHistogram[k];
					if (k === 95)
					{
						// handle unicode
						while (range < 23091221)
						{
							range *= 92;
							value *= 92;
							if (pos < compressed.length) value += decode92[compressed.charCodeAt(pos++)];
						}
						const n = 1114112;   // unicode range
						code = (value * n / range) | 0;
						let l = (code * range / n) | 0;
						let u = ((code+1) * range / n) | 0;
						if (value >= u)
						{
							code++;
							l = u;
							u = ((code+1) * range / n) | 0;
						}
						value -= l;
						range = u - l;
						if (code >= 65536) i++;   // character uses two utf-16 code points
					}
					codes.push(code);
					if (codes.length >= 4096)
					{
						parts.push(String.fromCodePoint(...codes));
						codes = [];
					}
					break;
				}
				l = u;
			}
		}
		parts.push(String.fromCodePoint(...codes));
		return parts.join("");
	}

	// decode the header
	let typeCumulation = new Uint32Array(13);
	{
		let total = 0;
		for (let i=0; i<12; i++)
		{
			typeCumulation[i] = total;
			total += loadSize();
		}
		typeCumulation[12] = total;
	}

	// decode dictionary keys
	let nKeys = loadSize();
	let index2key = [];
	let keyCumulation = new Uint32Array(nKeys + 1);
	{
		let total = 0;
		for (let i=0; i<nKeys; i++)
		{
			let key = loadString();
			let val = loadSize();
			index2key.push(key);
			keyCumulation[i] = total;
			total += val;
		}
		keyCumulation[nKeys] = total;
	}

	// decode the JSON value
	function decodeValue(t = null)
	{
		if (t === null) t = loadCategoryC(typeCumulation);
		if (t < 4)
		{
			if (t === 0) return null;
			else if (t === 1) return (loadBase(2) === 1);
			else if (t === 2) return loadNumber();
			else return loadString();
		}
		else if (t < 8)
		{
			// array
			let a = [];
			const size = loadSize();
			const subtype = (t === 4) ? null : t - 4;
			for (let i=0; i<size; i++) a.push(decodeValue(subtype));
			return a;
		}
		else
		{
			// dictionary
			let d = {};
			const size = loadSize();
			const subtype = (t === 8) ? null : t - 8;
			for (let i=0; i<size; i++)
			{
				const index = loadCategoryC(keyCumulation);
				const key = index2key[index];
				const val = decodeValue(subtype);
				d[key] = val;
			}
			return d;
		}
	}
	return decodeValue();
}
