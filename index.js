const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const zlib = require('zlib');
const tar = require('tar-fs');
const log = require('bestikk-log');

const deleteFolderRecursive = (path) => {
  let files = [];
  if (fs.existsSync(path)) {
    files = fs.readdirSync(path);
    files.forEach(function (file) {
      const curPath = path + "/" + file;
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
const mkdirsSync = (p, made) => {
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
        let stat;
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
};

const execSync = (command) => {
  log.debug(command);
  if (!process.env.DRY_RUN) {
    stdout = child_process.execSync(command);
    process.stdout.write(stdout);
  }
};

const getContentFromURL = (source, target) => new Promise((resolve) => {
  log.transform('get', source, target);
  const targetStream = fs.createWriteStream(target);
  let downloadModule;
  // startWith alternative
  if (source.lastIndexOf('https', 0) === 0) {
    downloadModule = https;
  } else {
    downloadModule = http;
  }
  downloadModule.get(source, function (response) {
    response.pipe(targetStream);
    targetStream.on('finish', function () {
      targetStream.close();
      resolve();
    });
  });
});

const untar = (source, baseDirName, destinationDir) => new Promise((resolve) => {
  log.transform('untar', source, destinationDir + '/' + baseDirName);
  const stream = fs.createReadStream(source).pipe(zlib.createGunzip()).pipe(tar.extract(destinationDir, {
    map: function (header) {
      // REMIND Do NOT user path.sep!
      // In this case, even on Windows, the separator is '/'.
      const paths = header.name.split('/');
      // replace base directory with 'baseDirName'
      paths.shift();
      paths.unshift(baseDirName);
      header.name = paths.join('/');
      return header;
    }
  }));
  stream.on('finish', function () {
    resolve();
  });
});

const isWin = () => /^win/.test(process.platform);

const jdk8DownloadURL = () => new Promise((resolve, reject) => {
  const jdkId = isWin() ? 'winOffline64JDK' : 'lin64JDKrpm';
  http.get('http://jdk.java.net/8/', (result) => {
    const data = [];
    result.setEncoding('utf8');
    result.on('data', (chunk) => {
      data.push(chunk);
    });
    result.on('end', () => {
      const html = data.join('');
      const jdkURLRegexp = new RegExp('document\\.getElementById\\(\\"' + jdkId + '\\"\\)\\.href = "(.*)";');
      const jdkURL = jdkURLRegexp.exec(html)[1];
      resolve(jdkURL);
    });
  }).on('error', (e) => {
    console.error(e);
    reject(e);
  });
});

const jdk9DownloadURL = () => new Promise((resolve, reject) => {
  http.get('http://jdk.java.net/9/', (result) => {
    const data = [];
    result.setEncoding('utf8');
    result.on('data', function (chunk) {
      data.push(chunk);
    });
    result.on('end', function () {
      const html = data.join('');
      let jdkURLRegexp;
      if (isWin()) {
        jdkURLRegexp = new RegExp('href="(https:\/\/download.java.net\/java.*_windows-x64.*)"');
      } else {
        jdkURLRegexp = new RegExp('href="(https:\/\/download.java.net\/java.*_linux-x64.*)"');
      }
      const jdkURL = jdkURLRegexp.exec(html)[1];
      resolve(jdkURL);
    });
  }).on('error', function (e) {
    console.error(e);
    reject(e);
  });
});

const download = (url, destination) => {
  log.task('download ' + url);
  if (fs.existsSync(destination)) {
    log.info('File ' + destination + ' already exists, skipping download');
    return Promise.resolve();
  }
  log.info('Starting download...');
  return getContentFromURL(url, destination);
};

const install = (installDir, jdkName, jdkURL) => {
  const suffix = jdkURL.endsWith('.exe') ? '.exe' : '.tar.gz';
  const jdkEADownloadDestination = os.tmpdir() + path.sep + jdkName + suffix;

  const waitWindowsInstallCompletion = (jdkInstallDir) => {
    if (!fs.existsSync(jdkInstallDir + path.sep + 'bin' + path.sep + 'jjs.exe')
      || !fs.existsSync(jdkInstallDir + path.sep + 'bin' + path.sep + 'javac.exe')
      || !fs.existsSync(jdkInstallDir + path.sep + 'bin' + path.sep + 'java.exe')) {
      setTimeout(waitWindowsInstallCompletion(jdkInstallDir), 1000);
    }
  };

  deleteFolderRecursive(installDir);
  mkdirsSync(installDir);

  return download(jdkURL, jdkEADownloadDestination)
    .then(() => {
      if (jdkURL.endsWith(".exe")) {
        const winInstallDir = installDir.replace(/\\\//, '\\\\').replace(/\//, '\\\\');
        execSync(jdkEADownloadDestination + ' /s INSTALLDIR="%CD%\\' + winInstallDir + '"');
        waitWindowsInstallCompletion(installDir);
        return Promise.resolve();
      }
      log.task('uncompress ' + jdkName);
      return untar(jdkEADownloadDestination, '', installDir);
    });
};

class JDKEA {
  constructor () {
    this.jdk8EAName = 'jdk1.8.0-ea';
    this.jdk9EAName = 'jdk1.9.0-ea';
  };

  installJDK8EA (installDir) {
    return jdk8DownloadURL()
      .then((jdkDownloadURL) => install(installDir, this.jdk8EAName, jdkDownloadURL));
  };

  installJDK9EA (installDir) {
    return jdk9DownloadURL()
      .then((jdkDownloadURL) => install(installDir, this.jdk9EAName, jdkDownloadURL));
  };
}

module.exports = new JDKEA();
