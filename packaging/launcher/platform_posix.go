//go:build linux || darwin

package main

import (
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"
)

func lockInstance(data string) (func(), bool, error) {
	path := filepath.Join(data, "launcher.lock")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return nil, false, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		f.Close()
		return nil, false, syscall.EINVAL
	}
	err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err == syscall.EWOULDBLOCK {
		f.Close()
		return func() {}, false, nil
	}
	if err != nil {
		f.Close()
		return nil, false, err
	}
	return func() { syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, true, nil
}
func startOwned(cmd *exec.Cmd, _ io.WriteCloser) (func(), error) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
			time.Sleep(3 * time.Second)
			syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		})
	}, nil
}
func notifyTermination(c chan os.Signal) { signal.Notify(c, syscall.SIGTERM) }
func openBrowser(url string) error {
	tool := "/usr/bin/xdg-open"
	if runtime.GOOS == "darwin" {
		tool = "/usr/bin/open"
	}
	cmd := exec.Command(tool, url)
	if err := cmd.Start(); err != nil {
		return err
	}
	go cmd.Wait()
	return nil
}
