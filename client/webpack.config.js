const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      title: 'BPMN 실시간 협업 데모'
    })
  ],
  devServer: {
    static: './dist',
    port: 8082,
    hot: true,
    open: true
  },
  resolve: {
    fallback: {
      "buffer": false,
      "crypto": false,
      "stream": false,
      "util": false,
      "path": false,
      "fs": false
    }
  }
};