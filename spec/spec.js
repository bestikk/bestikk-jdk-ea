var child_process = require('child_process');
var fs = require('fs');
var chai = require('chai');
var assert = chai.assert;

var main = require('../index.js');

describe('Bestikk', function() {
  describe('#installJDK9EA', function() {
    it('should install JDK 9 EA in test_install directory', function(done) {
      this.timeout(300000); // 5 minutes
      main.installJDK9EA('test_install', function(err) {
        if (err) {
          done(err);
        } else {
          assert.equal(fs.existsSync('test_install/jdk1.9.0-ea/bin/java'), true);
          var result = child_process.spawnSync('test_install/jdk1.9.0-ea/bin/java', ['-version'], {encoding: 'utf8'});
          assert.include(result.stderr, '9-ea');
          done();
        }
      });
    });
  });

  describe('#installJDK8EA', function() {
    it('should install JDK 8 EA in test_install directory', function(done) {
      this.timeout(300000); // 5 minutes
      main.installJDK8EA('test_install', function(err) {
        if (err) {
          done(err);
        } else {
          assert.equal(fs.existsSync('test_install/jdk1.8.0-ea/bin/java'), true);
          var result = child_process.spawnSync('test_install/jdk1.8.0-ea/bin/java', ['-version'], {encoding: 'utf8'});
          assert.include(result.stderr, '1.8.0');
          assert.include(result.stderr, 'ea');
          done();
        }
      });
    });
  });
});
