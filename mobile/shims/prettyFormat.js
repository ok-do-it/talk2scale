"use strict";

const format = (value) => {
	if (typeof value === "string") {
		return value;
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

module.exports = {
	format,
	plugins: {
		ReactElement: {},
	},
};
