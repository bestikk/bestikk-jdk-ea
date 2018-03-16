const child_process = require('child_process');
const fs = require('fs');
const chai = require('chai');
const assert = chai.assert;

const jdkEA = require('../index.js');

describe('Bestikk', function () {
  describe('#installJDK9EA', function () {
    it('should install JDK 9 EA in test_install directory', function (done) {
      this.timeout(300000); // 5 minutes
      jdkEA.installJDK9EA('test_install/jdk9')
        .then(() => {
          assert.equal(fs.existsSync('test_install/jdk9/bin/java'), true);
          const result = child_process.spawnSync('test_install/jdk9/bin/java', ['-version'], {encoding: 'utf8'});
          assert.include(result.stderr, 'openjdk version "9');
          done();
        });
    });
  });

  describe('#installJDK8EA', function () {
    it('should install JDK 8 EA in test_install directory', function (done) {
      this.timeout(300000); // 5 minutes
      jdkEA.installJDK8EA('test_install/jdk8')
        .then(() => {
          assert.equal(fs.existsSync('test_install/jdk8/bin/java'), true);
          const result = child_process.spawnSync('test_install/jdk8/bin/java', ['-version'], {encoding: 'utf8'});
          assert.include(result.stderr, '1.8.0');
          assert.include(result.stderr, 'ea');
          done();
        });
    });
  });
});
