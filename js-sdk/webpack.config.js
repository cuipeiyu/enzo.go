'use strict'

const path = require('path');
const webpack = require('webpack');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    'index': './src/index.ts',
  },
  output: {
    clean: false,
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'umd',
    library: 'enzows',
    umdNamedDefine: true
  },
  plugins: [
    new webpack.ProgressPlugin(),
    new UglifyJSPlugin(),
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  module: {
    rules: [{
      test: /\.tsx?$/,
      loader: 'ts-loader',
      exclude: /node_modules/,
    }]
  }
}
