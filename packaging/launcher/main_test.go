package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func fixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	suffix := ""
	platform := runtime.GOOS
	arch := runtime.GOARCH
	if platform == "windows" {
		suffix = ".exe"
		platform = "win32"
	}
	if arch == "amd64" {
		arch = "x64"
	}
	m := manifest{ManifestVersion: 1, PackageVersion: 1, AppVersion: "0.1.0", RuntimeVersion: "0.1.0", APIVersion: 1, EngineVersion: "1.8.3", NodeVersion: "24.21.0", ModelID: "base.en", Origin: origin, Platform: platform, Arch: arch}
	targetOS := runtime.GOOS
	if targetOS == "darwin" {
		targetOS = "macos"
	}
	m.Target = targetOS + "-" + arch
	paths := []string{"launcher" + suffix, "native/node" + suffix, "native/whisper-cli" + suffix, "native/ffmpeg" + suffix, "native/ffprobe" + suffix, "runtime/packaged.mjs", "runtime/main.mjs", "web/index.html", "models/ggml-base.en.bin", "manifest/build.json", "manifest/sbom.cdx.json", "manifest/whisper-config.cmake", "licenses/NOTICE.txt"}
	if runtime.GOOS == "linux" {
		for _, name := range []string{"libstdc++.so.6", "libgcc_s.so.1", "libavcodec.so.62", "libavdevice.so.62", "libavfilter.so.11", "libavformat.so.62", "libavutil.so.60", "libswresample.so.6", "libswscale.so.9"} {
			paths = append(paths, "native/"+name)
		}
	}
	for i, path := range paths {
		os.MkdirAll(filepath.Dir(filepath.Join(root, path)), 0700)
		os.WriteFile(filepath.Join(root, path), []byte("fixture"), 0600)
		m.Artifacts = append(m.Artifacts, artifact{Path: path, Size: 7, SHA256: fmt.Sprintf("%x", sha256.Sum256([]byte("fixture"))), ID: fmt.Sprintf("artifact-%d", i)})
	}
	bytes, _ := json.Marshal(m)
	os.WriteFile(filepath.Join(root, "manifest/package.json"), bytes, 0600)
	return root
}
func TestInventory(t *testing.T) {
	root := fixture(t)
	if err := verify(root); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(root, "web/index.html"), []byte("corrupt"), 0600)
	if verify(root) == nil {
		t.Fatal("corrupt artifact accepted")
	}
}
func TestExtraFile(t *testing.T) {
	root := fixture(t)
	os.WriteFile(filepath.Join(root, "unowned"), []byte("x"), 0600)
	if verify(root) == nil {
		t.Fatal("extra file accepted")
	}
}
func TestMissingFile(t *testing.T) {
	root := fixture(t)
	os.Remove(filepath.Join(root, "web/index.html"))
	if verify(root) == nil {
		t.Fatal("missing file accepted")
	}
}
func TestSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("requires Windows symlink privilege")
	}
	root := fixture(t)
	path := filepath.Join(root, "web/index.html")
	os.Remove(path)
	os.Symlink("../licenses/NOTICE.txt", path)
	if verify(root) == nil {
		t.Fatal("symlink accepted")
	}
}
func TestSingleInstance(t *testing.T) {
	data := t.TempDir()
	unlock, owned, err := lockInstance(data)
	if err != nil || !owned {
		t.Fatal(err)
	}
	defer unlock()
	other, owned, err := lockInstance(data)
	if err != nil || owned {
		t.Fatal("duplicate instance")
	}
	other()
}

func TestReadinessCrashAndCancellation(t *testing.T) {
	done := make(chan error)
	close(done)
	if waitReady(done, make(chan struct{}), "http://127.0.0.1:1", time.Second) == nil {
		t.Fatal("crash accepted")
	}
	quit := make(chan struct{})
	close(quit)
	if waitReady(make(chan error), quit, "http://127.0.0.1:1", time.Second) == nil {
		t.Fatal("cancel accepted")
	}
}
func TestReadinessTimeoutAndForeignVersion(t *testing.T) {
	if waitReady(make(chan error), make(chan struct{}), "http://127.0.0.1:1", time.Millisecond) == nil {
		t.Fatal("timeout accepted")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"runtimeVersion":"9.0.0","apiVersion":1}`)
	}))
	defer server.Close()
	if waitReady(make(chan error), make(chan struct{}), server.URL, time.Second) == nil {
		t.Fatal("foreign runtime accepted")
	}
}
