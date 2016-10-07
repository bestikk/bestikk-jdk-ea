var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');
var os = require('os');
var zlib = require('zlib');
var tar = require('tar-fs');
var async = require('async');
var log = require('bestikk-log');


var JDKEA = function() {
  this.jdk8EAName = 'jdk1.8.0-ea';
  this.jdk9EAName = 'jdk1.9.0-ea';
}

var deleteFolderRecursive = function(path) {
  var files = [];
  if (fs.existsSync(path)) {
    files = fs.readdirSync(path);
    files.forEach(function(file){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

// https://github.com/jprichardson/node-fs-extra/blob/master/lib/mkdirs/mkdirs-sync.js
var mkdirsSync = function(p, made) {
  p = path.resolve(p);
  try {
    fs.mkdirSync(p);
    made = made || p;
  } catch (err0) {
    switch (err0.code) {
      case 'ENOENT' :
        made = mkdirsSync(path.dirname(p), made);
        mkdirsSync(p, made);
        break;

      // In the case of any other error, just see if there's a dir
      // there already.  If so, then hooray!  If not, then something
      // is borked.
      default:
        var stat;
        try {
          stat = fs.statSync(p);
        } catch (err1) {
          throw err0;
        }
        if (!stat.isDirectory()) throw err0;
        break;
    }
  }
  return made;
}

var execSync = function(command) {
  log.debug(command);
  if (!process.env.DRY_RUN) {
    stdout = child_process.execSync(command);
    process.stdout.write(stdout);
  }
};

var mkdirSync = function(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }
};

var getContentFromURL = function(source, target, callback) {
  log.transform('get', source, target);
  var targetStream = fs.createWriteStream(target);
  var downloadModule;
  // startWith alternative
  if (source.lastIndexOf('https', 0) === 0) {
    downloadModule = https;
  } else {
    downloadModule = http;
  }
  downloadModule.get(source, function(response) {
    response.pipe(targetStream);
    targetStream.on('finish', function () {
      targetStream.close(callback);
    });
  });
};

var untar = function(source, baseDirName, destinationDir, callback) {
  log.transform('untar', source, destinationDir + '/' + baseDirName); 
  var stream = fs.createReadStream(source).pipe(zlib.createGunzip()).pipe(tar.extract(destinationDir, {
    map: function (header) {
      // REMIND Do NOT user path.sep!
      // In this case, even on Windows, the separator is '/'.
      var paths = header.name.split('/');
      // replace base directory with 'baseDirName'
      paths.shift();
      paths.unshift(baseDirName);
      header.name = paths.join('/');
      return header;
    }
  }));
  stream.on('finish', function () {
    callback();
  });
};

var isWin = function() {
  return /^win/.test(process.platform);
};

var jdkDownloadURL = function(jdkId, url, callback) {
  https.get(url, function(result) {
    var data = [];
    result.setEncoding('utf8');
    result.on('data', function(chunk) {
      data.push(chunk);
    });
    result.on('end', function(){
      var html = data.join('');
      var jdkURLRegexp = new RegExp('document\\.getElementById\\(\\"' + jdkId + '\\"\\)\\.href = \\"http:\\/\\/www.java.net\\/download\\/(.*)\\";');
      var match = jdkURLRegexp.exec(html)[1];
      // Avoid redirection http -> https
      var jdkURL = 'http://download.java.net/' + match;
      callback(jdkURL);
    });
  }).on('error', function(e) {
    console.error(e);
  });
};

var jdk8DownloadURL = function(callback) {
  var jdkId = isWin() ? 'winOffline64JDK' : 'lin64JDKrpm';
  jdkDownloadURL(jdkId, 'https://jdk8.java.net/download.html', callback);
};

var jdk9DownloadURL = function(callback) {
  var jdkId = isWin() ? 'winOffline64JDK' : 'lin64JDKrpm';
  jdkDownloadURL(jdkId, 'https://jdk9.java.net/download/', callback);
};

var install = function(installDir, jdkName, jdkDownloadURLFunction, callback) {
  var jdkEADownloadDestination = isWin() ? os.tmpdir() + path.sep + jdkName + '.exe' : os.tmpdir() + path.sep + jdkName + '.tar.gz';

  function waitWindowsInstallCompletion(jdkInstallDir) {
    if (!fs.existsSync(jdkInstallDir + path.sep + 'bin' + path.sep + 'jjs.exe')
      || !fs.existsSync(jdkInstallDir + path.sep + 'bin' + path.sep + 'javac.exe')
      || !fs.existsSync(jdkInstallDir + path.sep + 'bin' + path.sep + 'java.exe')) {
      setTimeout(waitWindowsInstallCompletion(jdkInstallDir), 1000);
    }
  }

  async.series([
    function(callback) {
      deleteFolderRecursive(installDir);
      mkdirsSync(installDir);
      callback();
    },
    function(callback) {
      log.task('download ' + jdkName);
      if (fs.existsSync(jdkEADownloadDestination)) {
        log.info('File ' + jdkEADownloadDestination + ' already exists, skipping download');
        callback();
      } else {
        log.info('Starting download...');
        jdkDownloadURLFunction(function(jdkURL) {
          getContentFromURL(jdkURL, jdkEADownloadDestination, callback);
        });
      }
    },
    function(callback) {
      if (isWin()) {
        winInstallDir = installDir.replace(/\\\//, '\\\\').replace(/\//, '\\\\');
        execSync(jdkEADownloadDestination + ' /s INSTALLDIR="%CD%\\' + winInstallDir + '"');
        waitWindowsInstallCompletion(installDir);
        callback();
      } else {
        log.task('uncompress ' + jdkName);
        untar(jdkEADownloadDestination, '', installDir, callback);
      }
    }
  ], function() {
    typeof callback === 'function' && callback();
  });
};

JDKEA.prototype.installJDK8EA = function(installDir, callback) {
  install(installDir, this.jdk8EAName, jdk8DownloadURL, callback);
};

JDKEA.prototype.installJDK9EA = function(installDir, callback) {
  install(installDir, this.jdk9EAName, jdk9DownloadURL, callback);
};

module.exports = new JDKEA();
