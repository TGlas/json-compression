"use strict"

// This function is analogous to JSON.stringify, but it returns a
// compressed string that is not human-readable. It is safe to use the
// string as a double-quoted string literal. When including the string
// in an HTML file, note that it is quite improbable but not impossible
// that the string includes the sequence "</script>".
function compressJson(data)
{
	// alphabet encoding
	const encode92 = new Uint8Array(92);
	for (let i=0; i<92; i++)
	{
		let code = i + 33;
		if (code >= 34) code++;
		if (code >= 92) code++;
		encode92[i] = code;
	}

	// prepare histograms
	function getTypeCode(value)
	{
		if (value === null) return 0;
		if (Array.isArray(value))
		{
			if (value.length === 0) return 4;
			let t0 = getTypeCode(value[0]);
			if (t0 < 1 || t0 > 3) return 4;
			for (let i=1; i<value.length; i++)
			{
				let t1 = getTypeCode(value[i]);
				if (t1 !== t0) return 4;
			}
			return 4+t0;
		}
		const t = typeof value;
		if (t === "boolean") return 1;
		if (t === "number") return 2;
		if (t === "string") return 3;
		let first = true;
		let t0 = 0;
		for (let sub of Object.values(value))
		{
			if (first)
			{
				t0 = getTypeCode(sub);
				if (t0 < 0 || t0 > 3) return 8;
				first = false;
			}
			else
			{
				let t1 = getTypeCode(sub);
				if (t1 !== t0) return 8;
			}
		}
		return 8 + t0;
	}
	let typeHistogram = new Uint32Array(12);
	let keyHistogram = {};
	function collectHistograms(value)
	{
		let t = getTypeCode(value);
		typeHistogram[t]++;
		if (t >= 8)
		{
			if (t === 8) for (let sub of Object.values(value)) collectHistograms(sub);
			for (let key of Object.keys(value))
			{
				if (keyHistogram.hasOwnProperty(key)) keyHistogram[key]++;
				else keyHistogram[key] = 1;
			}
		}
		else if (t === 4)
		{
			for (let sub of value) collectHistograms(sub);
		}
	}
	collectHistograms(data);
	let typeCumulation = new Uint32Array(13);
	{
		let total = 0;
		for (let i=0; i<12; i++)
		{
			typeCumulation[i] = total;
			total += typeHistogram[i];
		}
		typeCumulation[12] = total;
	}
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

	// entropy encoding
	let numbers = new Uint8Array(65536);   // array of numbers in the range 0:92
	let len = 0;
	let range = 1;
	function storeBase(hist_low, hist_high, hist_total)
	{
		while (range < 23091221)
		{
			range *= 92;
			len++;
			if (len > numbers.length)
			{
				let new_a = new Uint8Array(2 * numbers.length);
				new_a.set(numbers, 0);
				numbers = new_a;
			}
		}
		let   value = (range * hist_low  / hist_total) | 0;
		const high  = (range * hist_high / hist_total) | 0;
		range = high - value;
		let pos = len - 1;
		while (value > 0)
		{
			const digit = value % 92;
			numbers[pos] += digit;
			if (numbers[pos] >= 92)
			{
				numbers[pos] -= 92;
				numbers[pos-1]++;
			}
			value = ((value - digit) / 92) | 0;
			pos--;
		}
		while (numbers[pos] >= 92)
		{
			numbers[pos] -= 92;
			pos--;
			numbers[pos]++;
		}
	}
	function encodeSize(num)
	{
		for (let base=10; ; base*=10)
		{
			if (num < base-1)
			{
				storeBase(num, num+1, base);
				break;
			}
			else
			{
				storeBase(base-1, base, base);
				num -= base-1;
			}
		}
	}
	function encodeNumber(j)
	{
		let q, v, n;
		if (j === (j | 0) && j >= -1000000 && j <= 1000000)
		{
			if (j >= -10 && j <= 100) { q = 0; v = j+     10; n =    111; }
			else if (j < -10000)      { q = 1; v = j+1000000; n = 990000; }
			else if (j < -10)         { q = 2; v = j+  10000; n =   9990; }
			else if (j > 10000)       { q = 3; v = j-  10000; n = 990000; }
			else                      { q = 4; v = j-    100; n =   9900; }
		}
		else
		{
			// find sign, mantissa, and exponent
			let sign = Math.sign(j);
			j *= sign;
			let num = 0;
			let exponent = Math.floor(Math.log10(j));
			let str = "";
			let mantissa = 0;
			while (j !== num && str.length < 17)
			{
				let digit = ((j - num) / Math.pow(10, exponent - str.length) % 10) | 0;
				if (digit < 9 && parseFloat(str + (digit+1) + "e" + (exponent - str.length)) <= j) digit++;
				str += digit;
				mantissa = 10 * mantissa + digit;
				num = parseFloat(str + "e" + (exponent - str.length + 1));
			}
			if (mantissa < 1e6 && exponent >= -2 && exponent <= 7)
			{
				while (mantissa < 1e5) mantissa *= 10;
				q = 5;
				v = [(sign+1)/2, mantissa, exponent+2];
				n = [2, 1000000, 10];
			}
			else if (mantissa < 1e10 && exponent >= -11 && exponent <= 20)
			{
				while (str.length < 10) str += "0";
				q = 6;
				v = [(sign+1)/2,
						parseInt(str.substring(0, 5)),
						parseInt(str.substring(5, 10)),
						exponent+11];
				n = [2, 100000, 100000, 32];
			}
			else
			{
				while (str.length < 17) str += "0";
				q = 7;
				v = [(sign+1)/2,
						parseInt(str.substring(0, 6)),
						parseInt(str.substring(6, 12)),
						parseInt(str.substring(12, 17)),
						exponent+323];
				n = [2, 1000000, 1000000, 100000, 632];
			}
		}
		let s = 0;
		for (let i=0; i<q; i++) s += numHist[i];
		let t = s + numHist[q];
		storeBase(s, t, numHist[8]);
		numHist[q]++;
		numHist[8]++;
		if (q < 5) storeBase(v, v+1, n);
		else for (let i=0; i<v.length; i++) storeBase(v[i], v[i]+1, n[i]);
	}
	function encodeString(j)
	{
		encodeSize(j.length);
		for (let c of j)
		{
			// extract the next unicode character
			const code = c.codePointAt(0);
			const plain = (code >= 32 && code < 127);

			// encode the character
			const n = strHist[96];
			const k = plain ? code - 32 : 95;
			let s = 0;
			for (let i=0; i<k; i++) s += strHist[i];
			let t = s + strHist[k];
			storeBase(s, t, n);
			if (! plain) storeBase(code, code+1, 1114112);

			// update the histogram and move on
			strHist[k]++;
			strHist[96]++;
			strHist = stringHistogram[k];
		}
	}

	// store type histogram
	for (let i=0; i<12; i++) encodeSize(typeHistogram[i]);

	// store key histogram
	let nKeys = Object.keys(keyHistogram).length;
	let keyCumulation = new Uint32Array(nKeys + 1);
	let key2index = {};
	encodeSize(nKeys);
	{
		let i=0, total=0;
		for (let [k, v] of Object.entries(keyHistogram))
		{
			encodeString(k);
			encodeSize(v);
			key2index[k] = i;
			keyCumulation[i] = total;
			i++;
			total += v;
		}
		keyCumulation[nKeys] = total;
	}

	// recursively encode the JSON value
	function encodeValue(j, storeType = true)
	{
		// store the type
		const t = getTypeCode(j);
		if (storeType) storeBase(typeCumulation[t], typeCumulation[t+1], typeCumulation[12]);

		// store the value
		if (t < 4)
		{
			if (t === 1)
			{
				// boolean
				const bit = j ? 1 : 0;
				storeBase(bit, bit+1, 2);
			}
			else if (t === 2)
			{
				// number
				encodeNumber(j);
			}
			else if (t === 3)
			{
				// string
				encodeString(j);
			}
		}
		else if (t < 8)
		{
			// array
			encodeSize(j.length);
			for (let sub of j) encodeValue(sub, t === 4);
		}
		else
		{
			// dictionary
			let n = Object.keys(j).length;
			encodeSize(n);
			for (let [k, v] of Object.entries(j))
			{
				const index = key2index[k];
				storeBase(keyCumulation[index], keyCumulation[index+1], keyCumulation[keyCumulation.length-1]);
				encodeValue(v, t === 8);
			}
		}
	}
	encodeValue(data);

	// turn the sequence of numbers into an ASCII string
	while (len > 0 && numbers[len-1] === 0) len--;
	let parts = [];
	for (let i=0; i<len; i+=4096)
	{
		let codes = [];
		const n = Math.min(len, i+4096);
		for (let j=i; j<n; j++) codes.push(encode92[numbers[j]]);
		parts.push(String.fromCharCode(...codes));
	}
	return parts.join("");
}
