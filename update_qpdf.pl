#!/usr/bin/env perl

# Download a pinned, checksum-verified qpdf build and stage it under
# .resources/qpdf/<platform>/bin so it ships with the packaged app and PDF
# deep-clean works fully offline.
#
# WINDOWS is bundled here because qpdf is not preinstalled on Windows and that
# is where offline deep-clean matters most. We bundle the 32-bit mingw build,
# which runs on both 32-bit and 64-bit Windows, covering both packaged arches.
#
# LINUX / macOS: qpdf is a natively-linked binary that is painful to ship across
# distros (shared libs / FUSE for AppImages). Those platforms install qpdf from
# their package manager (Arch: `pacman -S qpdf`, Debian/Ubuntu: `apt install qpdf`,
# macOS: `brew install qpdf`), and PdfScrubService falls back to that system qpdf
# automatically. If you DO want to bundle a Linux/macOS qpdf, drop the binary at
# .resources/qpdf/linux/bin/qpdf or .resources/qpdf/mac/bin/qpdf (chmod +x) and it
# will be picked up first.
#
# To bump the bundled version: update QPDF_VERSION + the asset name + SHA256
# below (values come from the qpdf GitHub Releases page, which lists sha256 for
# every asset).

package UpdateQpdf 1.0;

use strict;
use warnings;
use autodie;
use utf8;
use open qw(:std :utf8);

use File::Path qw(make_path remove_tree);
use File::Copy qw(copy);

use constant QPDF_VERSION => '12.3.2';

# 32-bit mingw build: runs on 32-bit AND 64-bit Windows. Self-contained
# (qpdf.exe plus its DLLs live in the archive's bin/ directory).
use constant WIN_ZIP_NAME => 'qpdf-' . QPDF_VERSION . '-mingw32.zip';
use constant WIN_ZIP_SHA256 =>
  'b35a0af0f6fe67be5ab47972fae13e1761d2127f325771e566a909be2eecac3c';

use constant RELEASE_BASE_URL =>
    'https://github.com/qpdf/qpdf/releases/download/v'
  . QPDF_VERSION . '/';

use constant DOWNLOADS_DIR => 'qpdf_downloads';
use constant WIN_BIN_DIR   => '.resources/qpdf/win/bin';

sub header {
  my $text = shift;
  my $bar = q{-} x length($text);
  print "\n$bar\n$text\n$bar\n";
  return;
}

sub run_command {
  my @command = @_;
  print '------> ' . join( ' ', @command ) . "\n";
  system(@command) == 0 or die "command failed: @command : $?";
  return;
}

sub download_file {
  my $filename = shift;
  my $url      = RELEASE_BASE_URL . $filename;
  run_command( 'curl', '-fSL', '-o', DOWNLOADS_DIR . "/$filename", $url );
  return;
}

# Verify SHA-256 using whichever tool is available (shasum or sha256sum).
sub verify_sha256 {
  my ( $filename, $expected ) = @_;
  my $path = DOWNLOADS_DIR . "/$filename";

  my $tool =
      ( `which shasum 2>/dev/null` ne '' ) ? 'shasum -a 256'
    : ( `which sha256sum 2>/dev/null` ne '' ) ? 'sha256sum'
    :   die "Neither shasum nor sha256sum found to verify checksum\n";

  my $output = qx($tool "$path");
  my ($actual) = split( ' ', $output );

  if ( lc($actual) eq lc($expected) ) {
    print "SHA-256 OK: $filename\n";
  }
  else {
    die "\n!!! SHA-256 MISMATCH for $filename\n"
      . "  expected: $expected\n"
      . "  actual:   $actual\n";
  }
  return;
}

sub extract_zip {
  my $filename = shift;
  run_command( 'unzip', '-q', '-o', DOWNLOADS_DIR . "/$filename", '-d',
    DOWNLOADS_DIR );
  return;
}

# The mingw zip extracts to qpdf-<version>-mingw32/ with qpdf.exe and all its
# DLLs inside a bin/ subdirectory. Copy the whole bin/ across so the DLLs sit
# next to qpdf.exe (Windows resolves DLLs from the executable's directory).
sub stage_windows_binary {
  my ($zip_name) = @_;
  my ($dir_name) = $zip_name =~ /^(.+)\.zip$/;
  my $from_bin = DOWNLOADS_DIR . "/$dir_name/bin";

  -d $from_bin or die "Expected bin/ directory not found at $from_bin\n";

  # Wipe previously-staged binaries (keep the .keep placeholder).
  if ( -d WIN_BIN_DIR ) {
    opendir( my $dh, WIN_BIN_DIR );
    for my $entry ( readdir $dh ) {
      next if $entry eq '.' || $entry eq '..' || $entry eq '.keep';
      remove_tree( WIN_BIN_DIR . "/$entry" );
    }
    closedir $dh;
  }
  else {
    make_path(WIN_BIN_DIR);
  }

  opendir( my $dh, $from_bin );
  my @files = grep { $_ ne '.' && $_ ne '..' } readdir $dh;
  closedir $dh;

  for my $file (@files) {
    run_command( 'cp', "$from_bin/$file", WIN_BIN_DIR . "/$file" );
  }
  return;
}

sub run {
  header( 'Bundling qpdf ' . QPDF_VERSION . ' (Windows)' );

  remove_tree(DOWNLOADS_DIR) if -d DOWNLOADS_DIR;
  make_path(DOWNLOADS_DIR);

  header('Downloading');
  download_file(WIN_ZIP_NAME);

  header('Verifying checksum');
  verify_sha256( WIN_ZIP_NAME, WIN_ZIP_SHA256 );

  header('Extracting');
  extract_zip(WIN_ZIP_NAME);

  header('Staging Windows binary');
  stage_windows_binary(WIN_ZIP_NAME);

  header('Cleaning up');
  remove_tree(DOWNLOADS_DIR);

  print "\nDone. Bundled qpdf "
    . QPDF_VERSION
    . " for Windows at "
    . WIN_BIN_DIR . "\n";
  print
"Linux/macOS use the system qpdf (install via your package manager); the app falls back to it automatically.\n";
  return;
}

run();

1;
