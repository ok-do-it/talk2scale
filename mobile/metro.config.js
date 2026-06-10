const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === "ansi-regex") {
		return {
			type: "sourceFile",
			filePath: path.resolve(__dirname, "shims/ansiRegex.js"),
		};
	}

	if (moduleName === "pretty-format") {
		return {
			type: "sourceFile",
			filePath: path.resolve(__dirname, "shims/prettyFormat.js"),
		};
	}

	return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
