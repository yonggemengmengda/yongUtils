//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js'],
    fallback: {
      'tinyliquid': false,
      'liquid-node': false,
      'jade': false,
      'then-jade': false,
      'dust': false,
      'dustjs-helpers': false,
      'dustjs-linkedin': false,
      'swig': false,
      'swig-templates': false,
      'razor-tmpl': false,
      'pug': false,
      'then-pug': false,
      'qejs': false,
      'nunjucks': false,
      'arc-templates/dist/es5': false,
      'velocityjs': false,
      'atpl': false,
      'liquor': false,
      'twig': false,
      'ejs': false,
      'eco': false,
      'jazz': false,
      'jqtpl': false,
      'hamljs': false,
      'hamlet': false,
      'whiskers': false,
      'haml-coffee': false,
      'hogan.js': false,
      'templayed': false,
      'handlebars': false,
      'underscore': false,
      'lodash': false,
      'walrus': false,
      'mustache': false,
      'just': false,
      'ect': false,
      'mote': false,
      'toffee': false,
      'dot': false,
      'bracket-template': false,
      'ractive': false,
      'htmling': false,
      'babel-core': false,
      'plates': false,
      'react': false,
      'react-dom/server': false,
      'vash': false,
      'slm': false,
      'marko': false,
      'teacup/lib/express': false,
      'coffee-script': false,
      'squirrelly': false,
      'twing': false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.node.json',
              onlyCompileBundledFiles: true,
              transpileOnly: true
            }
          }
        ]
      },
      // {
      //   test: /node_modules\/sharp\/lib\/.*\.node$/,
      //   use: 'node-loader'
      // }
    ]
  },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /^(tinyliquid|liquid-node|jade|then-jade|dust|dustjs-helpers|dustjs-linkedin|swig|swig-templates|razor-tmpl|pug|then-pug|qejs|nunjucks|arc-templates\/dist\/es5|velocityjs|atpl|liquor|twig|ejs|eco|jazz|jqtpl|hamljs|hamlet|whiskers|haml-coffee|hogan\.js|templayed|handlebars|underscore|lodash|walrus|mustache|just|ect|mote|toffee|dot|bracket-template|ractive|htmling|babel-core|plates|react|react-dom\/server|vash|slm|marko|teacup\/lib\/express|coffee-script|squirrelly|twing)$/
    })
  ],
  ignoreWarnings: [
    {
      module: /@vue[\\/]compiler-sfc[\\/]dist[\\/]compiler-sfc\.cjs\.js$/,
      message: /Critical dependency:/
    }
  ],
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  }
};
module.exports = [ extensionConfig ];
