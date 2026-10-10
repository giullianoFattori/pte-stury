package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

const origin = "http://127.0.0.1:8765"

type artifact struct {
	Path   string
	Size   int64
	SHA256 string
	Kind   string
	ID     string
}
type manifest struct {
	ManifestVersion int
	PackageVersion  int
	AppVersion      string
	RuntimeVersion  string
	APIVersion      int
	EngineVersion   string
	NodeVersion     string
	ModelID         string
	Origin          string
	Platform        string
	Arch            string
	Target          string
	Artifacts       []artifact
}
type control struct {
	Address string
	Token   string
}

var safePath = regexp.MustCompile(`^[a-zA-Z0-9._/+\-]+$`)
var safeHash = regexp.MustCompile(`^[a-f0-9]{64}$`)

func boundedJSON(path string, target any) error {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 2*1024*1024 {
		return errors.New("invalid metadata")
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	dec := json.NewDecoder(io.LimitReader(f, 2*1024*1024+1))
	if err = dec.Decode(target); err != nil {
		return err
	}
	var extra any
	if dec.Decode(&extra) != io.EOF {
		return errors.New("trailing metadata")
	}
	return nil
}
func verify(root string) error {
	var m manifest
	if err := boundedJSON(filepath.Join(root, "manifest/package.json"), &m); err != nil {
		return err
	}
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "x64"
	}
	platform := runtime.GOOS
	if platform == "windows" {
		platform = "win32"
	}
	if m.ManifestVersion != 1 || m.PackageVersion != 1 || m.AppVersion != "0.1.0" || m.RuntimeVersion != "0.1.0" || m.APIVersion != 1 || m.EngineVersion != "1.8.3" || m.NodeVersion != "24.21.0" || m.ModelID != "base.en" || m.Origin != origin || m.Platform != platform || m.Arch != arch || len(m.Artifacts) < 1 || len(m.Artifacts) > 4096 {
		return errors.New("unsupported package")
	}
	targetOS := runtime.GOOS
	if targetOS == "darwin" {
		targetOS = "macos"
	}
	if m.Target != targetOS+"-"+arch {
		return errors.New("wrong target")
	}
	paths := map[string]bool{}
	ids := map[string]bool{}
	for _, a := range m.Artifacts {
		if !safePath.MatchString(a.Path) || !safeHash.MatchString(a.SHA256) || a.Size < 1 || paths[a.Path] || ids[a.ID] || a.ID == "" || strings.HasPrefix(a.Path, "/") {
			return errors.New("invalid inventory")
		}
		parts := strings.Split(a.Path, "/")
		current := root
		for _, part := range parts {
			if part == "" || part == "." || part == ".." {
				return errors.New("unsafe path")
			}
			current = filepath.Join(current, part)
			info, err := os.Lstat(current)
			if err != nil || info.Mode()&os.ModeSymlink != 0 {
				return errors.New("unsafe artifact")
			}
		}
		f, err := os.Open(current)
		if err != nil {
			return err
		}
		before, err := f.Stat()
		if err != nil || !before.Mode().IsRegular() || before.Size() != a.Size {
			f.Close()
			return errors.New("invalid artifact")
		}
		hash := sha256.New()
		n, err := io.Copy(hash, io.LimitReader(f, a.Size+1))
		after, e2 := f.Stat()
		f.Close()
		final, e3 := os.Lstat(current)
		if err != nil || e2 != nil || e3 != nil || n != a.Size || hex.EncodeToString(hash.Sum(nil)) != a.SHA256 || !os.SameFile(before, final) || !before.ModTime().Equal(after.ModTime()) || !before.ModTime().Equal(final.ModTime()) {
			return errors.New("corrupt artifact")
		}
		paths[a.Path] = true
		ids[a.ID] = true
	}
	suffix := ""
	if runtime.GOOS == "windows" {
		suffix = ".exe"
	}
	for _, path := range []string{"launcher" + suffix, "native/node" + suffix, "native/whisper-cli" + suffix, "native/ffmpeg" + suffix, "native/ffprobe" + suffix, "runtime/packaged.mjs", "runtime/main.mjs", "web/index.html", "models/ggml-base.en.bin", "manifest/build.json", "manifest/sbom.cdx.json", "manifest/whisper-config.cmake", "licenses/NOTICE.txt"} {
		if !paths[path] {
			return errors.New("incomplete inventory")
		}
	}
	if runtime.GOOS == "linux" {
		for _, name := range []string{"libstdc++.so.6", "libgcc_s.so.1", "libavcodec.so.62", "libavdevice.so.62", "libavfilter.so.11", "libavformat.so.62", "libavutil.so.60", "libswresample.so.6", "libswscale.so.9"} {
			if !paths["native/"+name] {
				return errors.New("missing owned library")
			}
		}
	}
	return filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.Type()&os.ModeSymlink != 0 {
			return errors.New("symlink")
		}
		if !d.IsDir() {
			rel, _ := filepath.Rel(root, path)
			rel = filepath.ToSlash(rel)
			if rel != "manifest/package.json" && !paths[rel] {
				return errors.New("unowned file")
			}
		}
		return nil
	})
}
func dataDirectory() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	var path string
	switch runtime.GOOS {
	case "windows":
		base, err := os.UserCacheDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(base, "PTE Study")
	case "darwin":
		path = filepath.Join(home, "Library", "Application Support", "PTE Study")
	default:
		path = filepath.Join(home, ".local", "share", "PTE Study")
	}
	if err = os.MkdirAll(path, 0700); err != nil {
		return "", err
	}
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("unsafe app data")
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0 {
		return "", errors.New("app data permissions")
	}
	return path, nil
}
func sendControl(data, command string) error {
	var c control
	if err := boundedJSON(filepath.Join(data, "control.json"), &c); err != nil {
		return errors.New("app is starting or unavailable; try again")
	}
	host, _, err := net.SplitHostPort(c.Address)
	if err != nil || host != "127.0.0.1" || len(c.Token) != 64 {
		return errors.New("invalid control")
	}
	conn, err := net.DialTimeout("tcp4", c.Address, time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(time.Second))
	_, err = fmt.Fprintf(conn, "%s %s\n", c.Token, command)
	return err
}
func ready(done <-chan error, quit <-chan struct{}) error {
	return waitReady(done, quit, origin, 100*time.Second)
}
func waitReady(done <-chan error, quit <-chan struct{}, endpoint string, timeout time.Duration) error {
	client := &http.Client{Timeout: time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect") }}
	defer client.CloseIdleConnections()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		select {
		case <-done:
			return errors.New("runtime exited before readiness")
		case <-quit:
			return errors.New("startup cancelled")
		default:
		}
		versionOK := false
		for _, route := range []string{"version", "health"} {
			resp, err := client.Get(endpoint + "/api/v1/" + route)
			if err != nil {
				break
			}
			var value struct {
				Status         string
				RuntimeVersion string
				APIVersion     int
				EngineVersion  string
				Model          struct{ ID string }
				ModelID        string
			}
			err = json.NewDecoder(io.LimitReader(resp.Body, 8192)).Decode(&value)
			resp.Body.Close()
			if err != nil || resp.StatusCode != 200 {
				break
			}
			if route == "version" {
				versionOK = value.RuntimeVersion == "0.1.0" && value.APIVersion == 1 && value.EngineVersion == "1.8.3"
				if !versionOK {
					return errors.New("unexpected runtime version")
				}
			} else {
				if value.Status == "error" {
					return errors.New("runtime integrity or initialization failed")
				}
				if versionOK && value.Status == "ready" && value.Model.ID == "base.en" {
					return nil
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	return errors.New("runtime startup timed out")
}
func run() error {
	args := os.Args[1:]
	command := "open"
	if len(args) > 0 {
		if len(args) != 1 || (args[0] != "--quit" && args[0] != "--no-browser" && args[0] != "--verify") {
			return errors.New("usage: launcher [--quit|--no-browser|--verify]")
		}
		command = args[0]
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	root := filepath.Dir(exe)
	if err = verify(root); err != nil {
		return errors.New("package verification failed; reinstall the complete package")
	}
	if command == "--verify" {
		fmt.Println(`{"event":"package verified"}`)
		return nil
	}
	data, err := dataDirectory()
	if err != nil {
		return errors.New("private app data unavailable")
	}
	unlock, owned, err := lockInstance(data)
	if err != nil {
		return errors.New("single-instance lock failed")
	}
	if !owned {
		if command == "--quit" {
			return sendControl(data, "quit")
		}
		if command == "--no-browser" {
			return sendControl(data, "ping")
		}
		return sendControl(data, "open")
	}
	defer unlock()
	if command == "--quit" {
		return errors.New("PTE Study is not running")
	}
	probe, err := net.Listen("tcp4", "127.0.0.1:8765")
	if err != nil {
		if errors.Is(err, syscall.EADDRINUSE) {
			return errors.New("port 8765 is occupied; close the other application and launch again")
		}
		return errors.New("local listener unavailable; check operating-system permissions")
	}
	probe.Close()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer listener.Close()
	token := make([]byte, 32)
	if _, err = rand.Read(token); err != nil {
		return err
	}
	c := control{listener.Addr().String(), hex.EncodeToString(token)}
	bytes, _ := json.Marshal(c)
	controlPath := filepath.Join(data, "control.json")
	if info, e := os.Lstat(controlPath); e == nil && !info.Mode().IsRegular() {
		return errors.New("unsafe control metadata")
	}
	if err = os.WriteFile(controlPath, bytes, 0600); err != nil {
		return err
	}
	defer os.Remove(controlPath)
	suffix := ""
	if runtime.GOOS == "windows" {
		suffix = ".exe"
	}
	child := exec.Command(filepath.Join(root, "native/node"+suffix), filepath.Join(root, "runtime/packaged.mjs"), "--data", data)
	child.Dir = root
	child.Env = []string{"LANG=C.UTF-8", "LC_ALL=C.UTF-8"}
	if runtime.GOOS == "linux" {
		child.Env = append(child.Env, "LD_LIBRARY_PATH="+filepath.Join(root, "native"))
	}
	if runtime.GOOS == "windows" {
		child.Env = append(child.Env, "SystemRoot="+os.Getenv("SystemRoot"))
	}
	child.Stdout = io.Discard
	child.Stderr = io.Discard
	gate, err := child.StdinPipe()
	if err != nil {
		return err
	}
	stop, err := startOwned(child, gate)
	if err != nil {
		return errors.New("runtime could not start")
	}
	defer stop()
	done := make(chan error, 1)
	go func() { done <- child.Wait() }()
	gate.Write([]byte{1})
	quit := make(chan struct{})
	var once sync.Once
	closeQuit := func() { once.Do(func() { close(quit) }) }
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt)
	defer signal.Stop(signals)
	notifyTermination(signals)
	slots := make(chan struct{}, 8)
	go func() {
		for {
			conn, e := listener.Accept()
			if e != nil {
				return
			}
			select {
			case slots <- struct{}{}:
			default:
				conn.Close()
				continue
			}
			go func() {
				defer func() { <-slots }()
				defer conn.Close()
				conn.SetDeadline(time.Now().Add(time.Second))
				line, e := bufio.NewReader(io.LimitReader(conn, 128)).ReadString('\n')
				if e != nil {
					return
				}
				if line == c.Token+" quit\n" {
					closeQuit()
				} else if line == c.Token+" open\n" {
					_ = openBrowser(origin)
				}
			}()
		}
	}()
	go func() {
		select {
		case <-signals:
			closeQuit()
		case <-quit:
		}
	}()
	if err = ready(done, quit); err != nil {
		return err
	}
	fmt.Println(`{"event":"ready","origin":"http://127.0.0.1:8765"}`)
	if command != "--no-browser" {
		if err = openBrowser(origin); err != nil {
			fmt.Fprintln(os.Stderr, "PTE Study: browser could not open; open http://127.0.0.1:8765 manually")
		}
	}
	select {
	case <-quit:
	case <-signals:
	case <-done:
		return errors.New("runtime exited unexpectedly; relaunch PTE Study")
	}
	stop()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
	}
	fmt.Println(`{"event":"stopped"}`)
	return nil
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "PTE Study: "+err.Error())
		os.Exit(1)
	}
}
