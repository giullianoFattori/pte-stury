//go:build linux || darwin

package main

import (
	"os/exec"
	"syscall"
	"testing"
	"time"
)

func TestOwnedProcessGroup(t *testing.T) {
	cmd := exec.Command("/bin/sleep", "60")
	stop, err := startOwned(cmd, discardCloser{})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	stop()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("owned child survived shutdown")
	}
	if syscall.Kill(-cmd.Process.Pid, 0) != syscall.ESRCH {
		t.Fatal("owned process group survived")
	}
}

// io.WriteCloser is required only by the Windows cooperative pipe protocol.
type discardCloser struct{}

func (discardCloser) Write(b []byte) (int, error) { return len(b), nil }
func (discardCloser) Close() error                { return nil }
